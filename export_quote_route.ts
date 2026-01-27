// src/app/api/quote/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

/* =========================
   Schema
========================= */

const LineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int().positive(),
  price_key: z.string(), // SIZE_PHE | SIZE_LA | STD
  options: z.record(z.string(), z.string()).optional().default({}),
});

const BodySchema = z.object({
  promotion_code: z.string().nullable().optional(),
  lines: z.array(LineSchema).min(1),
});

/* =========================
   Helpers
========================= */

const money = (n: any) => Math.max(0, Math.round(Number(n || 0)));

const key = (pid: string, priceKey: string) => `${pid}|${priceKey}`;

/* =========================
   POST
========================= */

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const productIds = [...new Set(body.lines.map(l => l.product_id))];

    /* =========================
       Load products and prices in parallel (eliminate waterfall)
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
      body.promotion_code
        ? supabaseAdmin
            .from("promotions")
            .select("*")
            .eq("code", body.promotion_code)
            .eq("is_active", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

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
    const drinkQty = body.lines.reduce((s, l) => {
      return productMap.get(l.product_id)?.category === "DRINK"
        ? s + l.qty
        : s;
    }, 0);

    const freeUpsize =
      promo?.code === "FREE_UPSIZE_5" &&
      drinkQty >= (promo.min_qty ?? 5);

    /* =========================
       Load DISCOUNT scopes (only if needed, after promo check)
    ========================= */
    let discountCategories: string[] = [];

    // Only fetch scopes if we have a DISCOUNT promo (conditional async)
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

    const discountRate =
      promo?.promo_type === "DISCOUNT"
        ? Number(promo.percent_off ?? 0) / 100
        : 0;

    /* =========================
       Quote lines
    ========================= */
    let subtotalBefore = 0;
    let discountTotal = 0;

    const outLines = body.lines.map(l => {
      const product = productMap.get(l.product_id);
      const isDrink = product?.category === "DRINK";

      let displayKey = l.price_key;
      let chargedKey = l.price_key;

      if (
        freeUpsize &&
        isDrink &&
        priceMap.has(key(l.product_id, "SIZE_PHE")) &&
        priceMap.has(key(l.product_id, "SIZE_LA"))
      ) {
        displayKey = "SIZE_LA";
        chargedKey = "SIZE_PHE";
      }

      const unitBefore = priceMap.get(key(l.product_id, displayKey));
      const unitCharged = priceMap.get(key(l.product_id, chargedKey));

      if (!unitBefore || !unitCharged) {
        return {
          product_id: l.product_id,
          qty: l.qty,
          missing_price: true,
        };
      }

      const eligibleDiscount =
        discountRate > 0 &&
        (discountCategories.length === 0 ||
          discountCategories.includes(product?.category ?? ""));

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

    /* =========================
       Response
    ========================= */
    return NextResponse.json({
      ok: true,
      lines: outLines,
      totals: {
        subtotal_before: subtotalBefore,
        discount_total: discountTotal,
        grand_total: subtotalBefore - discountTotal,
      },
      meta: {
        free_upsize_applied: freeUpsize,
        discount_percent: promo?.percent_off ?? 0,
        drink_qty: drinkQty,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 400 }
    );
  }
}
