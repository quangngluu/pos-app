// src/app/api/quote/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteOrder } from "@/app/lib/pricingEngine";

/* =========================
   Schema
========================= */

// Line-based quote: line_id handles duplicate products correctly
const LineSchema = z.object({
  line_id: z.string().uuid(), // POS line UUID - CRITICAL for duplicate product support
  product_id: z.string().uuid(),
  qty: z.number().int().positive(),
  price_key: z.string(), // SIZE_PHE | SIZE_LA | STD (requested key from UI)
  options: z.record(z.string(), z.string()).optional().default({}),
});

const BodySchema = z.object({
  promotion_code: z.string().nullable().optional(),
  lines: z.array(LineSchema).min(1),
});

/* =========================
   POST
========================= */

export async function POST(req: Request) {
  try {
    // Validate request
    const body = BodySchema.parse(await req.json());

    // Use shared pricing engine (single source of truth)
    const result = await quoteOrder({
      promotion_code: body.promotion_code,
      lines: body.lines,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 400 }
    );
  }
}
