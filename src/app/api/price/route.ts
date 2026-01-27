import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type SizeKey = "SIZE_PHE" | "SIZE_LA" | "STD";

type PriceRequestLine = {
  product_id: string;
  size: SizeKey;
  qty: number;
};

type PriceRequest = {
  lines: PriceRequestLine[];
  promotion_code?: string | null;
};

function safeInt(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

function toNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n: number): number {
  // VND integer
  return Math.round(n);
}

/**
 * Category normalization:
 * - DB có thể dùng TOP hoặc TOPPING => treat as same bucket for scope matching
 */
function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const c = String(cat).trim().toUpperCase();
  if (c === "TOPPING") return "TOP";
  return c;
}

function categoryMatchesScope(lineCat: string | null, scopeSet: Set<string>) {
  if (!lineCat) return false;
  const c = normalizeCategory(lineCat);
  if (!c) return false;

  // scopeSet stored normalized to TOP, DRINK, CAKE, MERCHANDISE...
  return scopeSet.has(c);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PriceRequest;

    const lines = (body.lines ?? [])
      .map((l) => ({
        product_id: String(l.product_id ?? ""),
        size: (l.size ?? "STD") as SizeKey,
        qty: safeInt(l.qty),
      }))
      .filter((l) => l.product_id && l.qty > 0);

    const promotion_code = body.promotion_code ? String(body.promotion_code) : null;

    if (lines.length === 0) {
      return NextResponse.json({
        ok: true,
        meta: {
          promotion_code,
          promoType: null,
          percentOff: 0,
          drinkQty: 0,
          freeUpsizeApplies: false,
          freeUpsizeThreshold: null,
          scopeCategories: [],
          missingPriceCount: 0,
        },
        pricedLines: [],
        totals: {
          subtotal_before_discount: 0,
          discount_amount: 0,
          grand_total: 0,
        },
      });
    }

    // ===== Parallel data fetching to eliminate waterfall (React Best Practice 1.3, 1.4) =====
    const productIds = Array.from(new Set(lines.map((l) => l.product_id)));
    
    // Start all independent queries immediately in parallel
    const promoPromise = promotion_code
      ? supabaseAdmin
          .from("promotions")
          .select("code, promo_type, percent_off, min_qty, is_active")
          .eq("code", promotion_code)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const productsPromise = supabaseAdmin
      .from("products")
      .select("id, code, category")
      .in("id", productIds);

    const basePricesPromise = supabaseAdmin
      .from("product_prices")
      .select("product_id, price_key, price_vat_incl")
      .in("product_id", productIds);

    // Execute all queries in parallel (CRITICAL optimization)
    const [promoResult, productsResult, basePricesResult] = await Promise.all([
      promoPromise,
      productsPromise,
      basePricesPromise,
    ]);

    // ===== 1) Process promotion =====
    let promoType: "DISCOUNT" | "RULE" | null = null;
    let percentOff = 0;
    let minQty: number | null = null;
    let isActive = false;

    if (promoResult.error) throw new Error(promoResult.error.message);

    const promo = promoResult.data;
    if (promo?.is_active) {
      isActive = true;
      promoType = (promo.promo_type ?? null) as any;
      percentOff = Number(promo.percent_off ?? 0) || 0;
      minQty = promo.min_qty != null ? Number(promo.min_qty) : null;
      if (!Number.isFinite(minQty as any)) minQty = null;
    }

    // ===== 2) Load promotion scopes (conditional - only if needed) =====
    let scopeCategories = new Set<string>();
    if (promotion_code && isActive) {
      const { data: scopes, error: scopeErr } = await supabaseAdmin
        .from("promotion_scopes")
        .select("scope_type, category, is_included")
        .eq("promotion_code", promotion_code);

      if (scopeErr) throw new Error(scopeErr.message);

      for (const s of scopes ?? []) {
        if (String(s.scope_type ?? "").toUpperCase() !== "CATEGORY") continue;
        if (!s.is_included) continue;
        const c = normalizeCategory(s.category);
        if (c) scopeCategories.add(c);
      }
    }

    const hasScope = scopeCategories.size > 0;

    // ===== 3) Process products =====
    if (productsResult.error) throw new Error(productsResult.error.message);

    const productMap = new Map<string, { code: string; category: string | null }>();
    for (const p of productsResult.data ?? []) {
      productMap.set(p.id, { code: p.code, category: normalizeCategory(p.category) });
    }

    const drinkQty = lines.reduce((sum, l) => {
      const p = productMap.get(l.product_id);
      if (p?.category === "DRINK") return sum + l.qty;
      return sum;
    }, 0);

    // ===== 4) Process base prices =====
    if (basePricesResult.error) throw new Error(basePricesResult.error.message);

    const basePrices = basePricesResult.data;

    const basePriceMap = new Map<string, number>();
    for (const r of basePrices ?? []) {
      const v = toNum(r.price_vat_incl);
      if (v == null) continue;
      basePriceMap.set(`${r.product_id}|${String(r.price_key)}`, v);
    }

    // helper: check sized
    function hasSizedPrices(product_id: string) {
      return (
        basePriceMap.has(`${product_id}|SIZE_PHE`) &&
        basePriceMap.has(`${product_id}|SIZE_LA`)
      );
    }

    // ===== 5) Determine FREE_UPSIZE applies (RULE, DB scope) =====
    const isFreeUpsizePromo = promotion_code === "FREE_UPSIZE_5";
    const freeUpsizeThreshold =
      promoType === "RULE" && isFreeUpsizePromo ? (minQty ?? 5) : null;

    // Only apply if:
    // - active RULE promo FREE_UPSIZE_5
    // - has scopes AND DRINK included (DB-driven)
    // - drinkQty >= threshold
    const freeUpsizeApplies =
      isActive &&
      promoType === "RULE" &&
      isFreeUpsizePromo &&
      hasScope &&
      scopeCategories.has("DRINK") &&
      freeUpsizeThreshold != null &&
      drinkQty >= freeUpsizeThreshold;

    // ===== 6) Pricing each line =====
    let missingPriceCount = 0;

    const pricedLines = lines.map((l) => {
      const p = productMap.get(l.product_id);
      const cat = p?.category ?? null;

      // "requested" price key from client (UI may show LA but send PHE)
      const requestedKey = l.size;

      // base requested price
      const requestedBase = basePriceMap.get(`${l.product_id}|${requestedKey}`);
      const requestedBaseOk = requestedBase != null;

      // Default: original = requested base, final = original (no discount)
      let original_price_key: SizeKey = requestedKey;
      let original_unit_price: number | null = requestedBaseOk ? requestedBase : null;

      let final_unit_price: number | null = requestedBaseOk ? requestedBase : null;

      // --- RULE: FREE_UPSIZE_5 ---
      // Contract:
      // - UI auto đổi dropdown sang LA, nhưng client gửi sizeForPricing = SIZE_PHE
      // - API sẽ tính original = LA price, final = PHE price (ghi nhận discount)
      if (
        freeUpsizeApplies &&
        cat === "DRINK" &&
        hasSizedPrices(l.product_id) &&
        requestedKey === "SIZE_PHE"
      ) {
        const la = basePriceMap.get(`${l.product_id}|SIZE_LA`);
        const phe = basePriceMap.get(`${l.product_id}|SIZE_PHE`);
        if (la != null && phe != null) {
          original_price_key = "SIZE_LA";
          original_unit_price = la;
          final_unit_price = phe;
        } else {
          // missing price => keep nulls
          original_unit_price = la ?? null;
          final_unit_price = phe ?? null;
        }
      }

      // compute line totals (strict)
      const original_line_total =
        original_unit_price != null ? roundMoney(original_unit_price * l.qty) : null;

      let final_line_total: number | null =
        final_unit_price != null ? roundMoney(final_unit_price * l.qty) : null;

      // --- DISCOUNT: percent off, DB scope ---
      // Only if:
      // - active DISCOUNT promo
      // - has scope (if not, apply none)
      // - line category matches scope
      // Apply on top of "original" (which may already be LA for freeupsize?).
      // Note: UI hiện chỉ chọn 1 promo_code => freeupsize và discount không stack cùng lúc.
      if (
        isActive &&
        promoType === "DISCOUNT" &&
        hasScope &&
        categoryMatchesScope(cat, scopeCategories) &&
        original_line_total != null
      ) {
        const pct = Math.max(0, Math.min(100, Number(percentOff) || 0));
        const disc = roundMoney((original_line_total * pct) / 100);
        final_line_total = Math.max(0, original_line_total - disc);

        // set final_unit_price from line total (to keep totals consistent)
        // allow decimals; UI formatMoney will round
        final_unit_price = final_line_total / l.qty;
      }

      // count missing
      if (original_line_total == null || final_line_total == null) missingPriceCount += 1;

      const discount_amount_line =
        original_line_total != null && final_line_total != null
          ? Math.max(0, roundMoney(original_line_total - final_line_total))
          : null;

      return {
        product_id: l.product_id,
        size: l.size, // keep request key (client uses this as map key)
        qty: l.qty,
        category: cat,

        // for UI strike-through:
        original_price_key,
        original_unit_price,
        final_unit_price,
        original_line_total,
        final_line_total,
        discount_amount_line,
      };
    });

    // ===== 7) Totals =====
    const subtotal_before_discount = pricedLines.reduce((s, x) => {
      return s + (x.original_line_total ?? 0);
    }, 0);

    const discount_amount = pricedLines.reduce((s, x) => {
      return s + (x.discount_amount_line ?? 0);
    }, 0);

    const grand_total = Math.max(0, subtotal_before_discount - discount_amount);

    // percentOff should be meaningful only for DISCOUNT
    const effectivePercent = isActive && promoType === "DISCOUNT" && hasScope ? percentOff : 0;

    return NextResponse.json({
      ok: true,
      meta: {
        promotion_code,
        promoType: isActive ? promoType : null,
        percentOff: effectivePercent,
        minQty: minQty ?? null,

        drinkQty,
        freeUpsizeApplies,
        freeUpsizeThreshold,

        scopeCategories: Array.from(scopeCategories),
        missingPriceCount,
      },
      pricedLines,
      totals: {
        subtotal_before_discount,
        discount_amount,
        grand_total,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
