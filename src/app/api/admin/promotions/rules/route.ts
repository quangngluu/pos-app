import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

/**
 * GET /api/admin/promotions/rules
 * List promotion rules for a specific promotion
 * Query params: ?promotion_code=CODE
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const promotion_code = searchParams.get("promotion_code");

  if (!promotion_code) {
    return NextResponse.json({ 
      ok: false, 
      error: "promotion_code is required" 
    }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("promotion_rules")
      .select("*")
      .eq("promotion_code", promotion_code)
      .order("rule_order", { ascending: true });

    if (error) {
      console.error("[Promotion Rules] GET error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rules: data || [] });
  } catch (e: any) {
    console.error("[Promotion Rules] GET exception:", e);
    return NextResponse.json({ 
      ok: false, 
      error: e.message 
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/promotions/rules
 * Create a new promotion rule
 */
const createRuleSchema = z.object({
  promotion_code: z.string().min(1),
  rule_order: z.number().int().min(0).optional().default(0),
  conditions: z.object({
    min_order_value: z.number().min(0).optional(),
    min_qty: z.number().int().min(0).optional(),
    min_eligible_qty: z.number().int().min(0).optional(),
  }).optional(),
  actions: z.array(z.union([
    z.object({
      type: z.literal("PERCENT_OFF"),
      percent: z.number().min(0).max(100),
      apply_to: z.literal("ELIGIBLE_LINES"),
    }),
    z.object({
      type: z.literal("AMOUNT_OFF"),
      amount: z.number().min(0),
      apply_to: z.enum(["ORDER_TOTAL", "ELIGIBLE_LINES"]),
      allocation: z.enum(["PROPORTIONAL", "EQUAL"]).optional(),
    }),
    z.object({
      type: z.literal("AMOUNT_OFF_PER_ITEM"),
      amount: z.number().min(0),
      max_items: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("FREE_ITEM"),
      variant_id: z.string().uuid(),
      qty: z.number().int().min(1),
      max_per_order: z.number().int().min(1).optional(),
    }),
  ])).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createRuleSchema.parse(body);

    const { data, error } = await supabaseAdmin
      .from("promotion_rules")
      .insert({
        promotion_code: validated.promotion_code,
        rule_order: validated.rule_order,
        conditions: validated.conditions || null,
        actions: validated.actions,
      })
      .select()
      .single();

    if (error) {
      console.error("[Promotion Rules] POST error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Promotion Rules] POST exception:", e);
    
    if (e instanceof z.ZodError) {
      return NextResponse.json({ 
        ok: false, 
        error: "Validation failed",
        detail: e.issues 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: e.message 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/promotions/rules
 * Update an existing promotion rule
 */
const updateRuleSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    rule_order: z.number().int().min(0).optional(),
    conditions: z.object({
      min_order_value: z.number().min(0).optional(),
      min_qty: z.number().int().min(0).optional(),
      min_eligible_qty: z.number().int().min(0).optional(),
    }).optional(),
    actions: z.array(z.union([
      z.object({
        type: z.literal("PERCENT_OFF"),
        percent: z.number().min(0).max(100),
        apply_to: z.literal("ELIGIBLE_LINES"),
      }),
      z.object({
        type: z.literal("AMOUNT_OFF"),
        amount: z.number().min(0),
        apply_to: z.enum(["ORDER_TOTAL", "ELIGIBLE_LINES"]),
        allocation: z.enum(["PROPORTIONAL", "EQUAL"]).optional(),
      }),
      z.object({
        type: z.literal("AMOUNT_OFF_PER_ITEM"),
        amount: z.number().min(0),
        max_items: z.number().int().min(0).optional(),
      }),
      z.object({
        type: z.literal("FREE_ITEM"),
        variant_id: z.string().uuid(),
        qty: z.number().int().min(1),
        max_per_order: z.number().int().min(1).optional(),
      }),
    ])).min(1).optional(),
  }),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = updateRuleSchema.parse(body);

    if (!Object.keys(validated.patch).length) {
      return NextResponse.json({ 
        ok: false, 
        error: "No fields to update" 
      }, { status: 400 });
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (validated.patch.rule_order !== undefined) {
      updateData.rule_order = validated.patch.rule_order;
    }
    if (validated.patch.conditions !== undefined) {
      updateData.conditions = validated.patch.conditions;
    }
    if (validated.patch.actions !== undefined) {
      updateData.actions = validated.patch.actions;
    }

    const { data, error } = await supabaseAdmin
      .from("promotion_rules")
      .update(updateData)
      .eq("id", validated.id)
      .select()
      .single();

    if (error) {
      console.error("[Promotion Rules] PATCH error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details
      }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ 
        ok: false, 
        error: "Rule not found" 
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Promotion Rules] PATCH exception:", e);
    
    if (e instanceof z.ZodError) {
      return NextResponse.json({ 
        ok: false, 
        error: "Validation failed",
        detail: e.issues 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: e.message 
    }, { status: 500 });
  }
}
