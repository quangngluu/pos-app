/**
 * Shared Pricing Engine
 * 
 * Purpose: Single source of truth for order pricing logic.
 * - Used by /api/quote for preview
 * - Used by /api/orders for server-side recomputation (don't trust client)
 * 
 * CRITICAL: Server must recompute all pricing to prevent manipulation.
 */

import { supabaseAdmin } from "./supabaseAdmin";

/* =========================
   Types
========================= */

export type QuoteLine = {
  line_id: string;
  product_id: string;
  qty: number;
  price_key: string; // For pricing calculation (may differ from display for FREE_UPSIZE)
  options?: Record<string, string>;
};

export type QuoteLineResult = {
  line_id: string;
  product_id: string;
  qty: number;
  display_price_key?: string; // What UI shows (LA for free upsize)
  charged_price_key?: string; // What we charge (PHE for free upsize)
  unit_price_before?: number;
  unit_price_after?: number;
  line_total_before?: number;
  line_total_after?: number;
  adjustments?: { type: string; amount: number }[];
  missing_price?: boolean;
};

export type QuoteResult = {
  ok: boolean;
  lines: QuoteLineResult[];
  totals: {
    subtotal_before: number;
    discount_total: number;
    grand_total: number;
  };
  meta: {
    free_upsize_applied?: boolean;
    discount_percent?: number;
    drink_qty?: number;
  };
  error?: string;
};

/* =========================
   Helpers
========================= */

const money = (n: any) => Math.max(0, Math.round(Number(n || 0)));

const key = (pid: string, priceKey: string) => `${pid}|${priceKey}`;

function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const c = String(cat).trim().toUpperCase();
  if (c === "TOPPING") return "TOP";
  return c;
}

/* =========================
   Main Engine
========================= */

export async function quoteOrder(input: {
  promotion_code?: string | null;
  lines: QuoteLine[];
}): Promise<QuoteResult> {
  try {
    const { promotion_code, lines } = input;

    if (!lines || lines.length === 0) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: "No lines provided",
      };
    }

    const productIds = [...new Set(lines.map(l => l.product_id))];

    /* =========================
       Load data in parallel
    ========================= */
    const [productsResult, pricesResult, promoResult] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, category")
        .in("id", productIds)
        .eq("is_active", true),
      supabaseAdmin
        .from("product_prices")
        .select("product_id, price_key, price_vat_incl")
        .in("product_id", productIds),
      promotion_code
        ? supabaseAdmin
            .from("promotions")
            .select("*")
            .eq("code", promotion_code)
            .eq("is_active", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (productsResult.error) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: `Products error: ${productsResult.error.message}`,
      };
    }

    if (pricesResult.error) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: `Prices error: ${pricesResult.error.message}`,
      };
    }

    const productMap = new Map(
      (productsResult.data ?? []).map(p => [p.id, p])
    );

    const priceMap = new Map<string, number>();
    (pricesResult.data ?? []).forEach(p => {
      priceMap.set(key(p.product_id, p.price_key), money(p.price_vat_incl));
    });

    const promo = promoResult.data;

    /* =========================
       FREE UPSIZE RULE
    ========================= */
    const drinkQty = lines.reduce((s, l) => {
      const cat = normalizeCategory(productMap.get(l.product_id)?.category);
      return cat === "DRINK" ? s + l.qty : s;
    }, 0);

    const freeUpsize =
      promo?.code === "FREE_UPSIZE_5" &&
      promo.promo_type === "RULE" &&
      drinkQty >= (promo.min_qty ?? 5);

    /* =========================
       DISCOUNT SCOPES
    ========================= */
    let discountCategories: string[] = [];

    if (promo?.promo_type === "DISCOUNT" && promo.code) {
      const { data } = await supabaseAdmin
        .from("promotion_scopes")
        .select("category")
        .eq("promotion_code", promo.code)
        .eq("is_included", true);

      discountCategories = (data ?? [])
        .map(x => x.category)
        .filter(Boolean);
    }

    const normalizedDiscountCategories = discountCategories
      .map(normalizeCategory)
      .filter((c): c is string => c !== null);

    // BUSINESS RULE: DISCOUNT with NO scope = NONE
    const discountRate =
      promo?.promo_type === "DISCOUNT" && normalizedDiscountCategories.length > 0
        ? Number(promo.percent_off ?? 0) / 100
        : 0;

    /* =========================
       Price each line
    ========================= */
    let subtotalBefore = 0;
    let discountTotal = 0;

    const outLines = lines.map(l => {
      const product = productMap.get(l.product_id);
      const productCategory = normalizeCategory(product?.category);
      const isDrink = productCategory === "DRINK";

      let displayKey = l.price_key;
      let chargedKey = l.price_key;

      // FREE_UPSIZE: display LA, charge PHE
      const hasBothSizes =
        priceMap.has(key(l.product_id, "SIZE_PHE")) &&
        priceMap.has(key(l.product_id, "SIZE_LA"));

      if (
        freeUpsize &&
        isDrink &&
        l.price_key === "SIZE_PHE" &&
        hasBothSizes
      ) {
        displayKey = "SIZE_LA";
        chargedKey = "SIZE_PHE";
      }

      const unitBefore = priceMap.get(key(l.product_id, displayKey));
      const unitCharged = priceMap.get(key(l.product_id, chargedKey));

      if (!unitBefore || !unitCharged) {
        return {
          line_id: l.line_id,
          product_id: l.product_id,
          qty: l.qty,
          missing_price: true,
        };
      }

      // DISCOUNT: only if scope matches
      const eligibleDiscount =
        discountRate > 0 &&
        productCategory !== null &&
        normalizedDiscountCategories.includes(productCategory);

      const unitAfter = eligibleDiscount
        ? money(unitCharged * (1 - discountRate))
        : unitCharged;

      const lineBefore = unitBefore * l.qty;
      const lineAfter = unitAfter * l.qty;

      subtotalBefore += lineBefore;
      discountTotal += lineBefore - lineAfter;

      const adjustments = [];

      if (displayKey !== chargedKey) {
        adjustments.push({
          type: "FREE_UPSIZE",
          amount: (unitBefore - unitCharged) * l.qty,
        });
      }

      if (eligibleDiscount) {
        adjustments.push({
          type: "DISCOUNT",
          amount: (unitCharged - unitAfter) * l.qty,
        });
      }

      return {
        line_id: l.line_id,
        product_id: l.product_id,
        qty: l.qty,
        display_price_key: displayKey,
        charged_price_key: chargedKey,
        unit_price_before: unitBefore,
        unit_price_after: unitAfter,
        line_total_before: lineBefore,
        line_total_after: lineAfter,
        adjustments,
      };
    });

    return {
      ok: true,
      lines: outLines,
      totals: {
        subtotal_before: subtotalBefore,
        discount_total: discountTotal,
        grand_total: subtotalBefore - discountTotal,
      },
      meta: {
        free_upsize_applied: freeUpsize,
        discount_percent:
          promo?.promo_type === "DISCOUNT" && normalizedDiscountCategories.length > 0
            ? (promo?.percent_off ?? 0)
            : 0,
        drink_qty: drinkQty,
      },
    };
  } catch (e: any) {
    return {
      ok: false,
      lines: [],
      totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
      meta: {},
      error: e?.message ?? "Unknown error",
    };
  }
}
