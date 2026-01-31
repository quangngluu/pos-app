import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

/**
 * GET /api/admin/promotions/scopes
 * List scope targets for a specific promotion
 * Query params: ?promotion_code=CODE&target_type=CATEGORY|SUBCATEGORY|PRODUCT|VARIANT
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const promotion_code = searchParams.get("promotion_code");
  const target_type = searchParams.get("target_type");

  if (!promotion_code) {
    return NextResponse.json({ 
      ok: false, 
      error: "promotion_code is required" 
    }, { status: 400 });
  }

  try {
    let query = supabaseAdmin
      .from("promotion_scope_targets")
      .select("*")
      .eq("promotion_code", promotion_code)
      .order("target_type", { ascending: true })
      .order("target_id", { ascending: true });

    if (target_type) {
      query = query.eq("target_type", target_type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Promotion Scopes] GET error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scopes: data || [] });
  } catch (e: any) {
    console.error("[Promotion Scopes] GET exception:", e);
    return NextResponse.json({ 
      ok: false, 
      error: e.message 
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/promotions/scopes
 * Create new scope targets (bulk operation)
 */
const createScopeSchema = z.object({
  promotion_code: z.string().min(1),
  targets: z.array(z.object({
    target_type: z.enum(["CATEGORY", "SUBCATEGORY", "PRODUCT", "VARIANT"]),
    target_id: z.string().min(1),
    is_included: z.boolean().optional().default(true),
  })).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createScopeSchema.parse(body);

    // Check for duplicates
    const { data: existing } = await supabaseAdmin
      .from("promotion_scope_targets")
      .select("target_type, target_id")
      .eq("promotion_code", validated.promotion_code);

    const existingSet = new Set(
      (existing || []).map(e => `${e.target_type}:${e.target_id}`)
    );

    const newTargets = validated.targets.filter(t => 
      !existingSet.has(`${t.target_type}:${t.target_id}`)
    );

    if (newTargets.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "All targets already exist" 
      }, { status: 400 });
    }

    const insertData = newTargets.map(t => ({
      promotion_code: validated.promotion_code,
      target_type: t.target_type,
      target_id: t.target_id,
      is_included: t.is_included,
    }));

    const { data, error } = await supabaseAdmin
      .from("promotion_scope_targets")
      .insert(insertData)
      .select();

    if (error) {
      console.error("[Promotion Scopes] POST error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details
      }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      data,
      inserted: newTargets.length 
    });
  } catch (e: any) {
    console.error("[Promotion Scopes] POST exception:", e);
    
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
 * PATCH /api/admin/promotions/scopes
 * Update scope target (toggle include/exclude)
 */
const updateScopeSchema = z.object({
  id: z.string().uuid(),
  is_included: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = updateScopeSchema.parse(body);

    const { data, error } = await supabaseAdmin
      .from("promotion_scope_targets")
      .update({ is_included: validated.is_included })
      .eq("id", validated.id)
      .select()
      .single();

    if (error) {
      console.error("[Promotion Scopes] PATCH error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details
      }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ 
        ok: false, 
        error: "Scope not found" 
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Promotion Scopes] PATCH exception:", e);
    
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
 * DELETE /api/admin/promotions/scopes
 * Remove scope targets (bulk operation)
 * Body: { ids: string[] }
 */
const deleteScopeSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = deleteScopeSchema.parse(body);

    const { error } = await supabaseAdmin
      .from("promotion_scope_targets")
      .delete()
      .in("id", validated.ids);

    if (error) {
      console.error("[Promotion Scopes] DELETE error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details
      }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      deleted: validated.ids.length 
    });
  } catch (e: any) {
    console.error("[Promotion Scopes] DELETE exception:", e);
    
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
