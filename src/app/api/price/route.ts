import { NextResponse } from "next/server";
import { quoteOrder } from "@/app/lib/pricingEngine";
import { randomUUID } from "crypto";

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

/**
 * POST /api/price
 * 
 * Uses shared pricingEngine for single source of truth.
 * Converts legacy format (product_id, size, qty) to line-based format.
 */
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

    // Convert to pricingEngine format (line-based with UUIDs)
    const engineLines = lines.map(l => ({
      line_id: randomUUID(), // Generate temp line IDs
      product_id: l.product_id,
      qty: l.qty,
      price_key: l.size, // SIZE_PHE, SIZE_LA, STD
      options: {},
    }));

    // Use shared pricing engine
    const result = await quoteOrder({
      promotion_code,
      lines: engineLines,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Pricing failed" },
        { status: 400 }
      );
    }

    // Convert back to legacy /api/price format
    const pricedLines = lines.map((l, idx) => {
      const engineLine = result.lines[idx];
      
      return {
        product_id: l.product_id,
        size: l.size,
        qty: l.qty,
        category: engineLine.debug?.normalized_category ?? null,
        
        // Map engine output to legacy format
        original_price_key: engineLine.display_price_key ?? l.size,
        original_unit_price: engineLine.unit_price_before ?? null,
        final_unit_price: engineLine.unit_price_after ?? null,
        original_line_total: engineLine.line_total_before ?? null,
        final_line_total: engineLine.line_total_after ?? null,
        discount_amount_line: engineLine.line_total_before && engineLine.line_total_after
          ? Math.max(0, engineLine.line_total_before - engineLine.line_total_after)
          : null,
      };
    });

    const missingPriceCount = pricedLines.filter(l => l.original_line_total == null).length;

    return NextResponse.json({
      ok: true,
      meta: {
        promotion_code,
        promoType: result.meta.free_upsize_applied ? "RULE" : (result.meta.discount_percent ? "DISCOUNT" : null),
        percentOff: result.meta.discount_percent ?? 0,
        minQty: result.meta.free_upsize_applied ? 5 : null,
        drinkQty: result.meta.drink_qty ?? 0,
        freeUpsizeApplies: result.meta.free_upsize_applied ?? false,
        freeUpsizeThreshold: result.meta.free_upsize_applied ? 5 : null,
        scopeCategories: [], // Engine handles this internally
        missingPriceCount,
      },
      pricedLines,
      totals: {
        subtotal_before_discount: result.totals.subtotal_before,
        discount_amount: result.totals.discount_total,
        grand_total: result.totals.grand_total,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
