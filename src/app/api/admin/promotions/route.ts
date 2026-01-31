import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/lib/requireAuth";

// Validation schemas
const createPromotionSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  promo_type: z.string().min(1, "Promo type is required"),
  priority: z.number().int().optional().default(0),
  is_stackable: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  percent_off: z.number().min(0).max(100).optional(),
  min_qty: z.number().int().min(0).optional(),
  scopes: z.array(z.string()).optional(), // Category scopes for DISCOUNT
});

const patchPromotionSchema = z.object({
  code: z.string().min(1, "Code is required"),
  patch: z.object({
    name: z.string().min(1).optional(),
    promo_type: z.string().min(1).optional(),
    priority: z.number().int().optional(),
    is_stackable: z.boolean().optional(),
    is_active: z.boolean().optional(),
    start_at: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    percent_off: z.number().min(0).max(100).nullable().optional(),
    min_qty: z.number().int().min(0).nullable().optional(),
  }),
  scopes: z.array(z.string()).optional(), // Category scopes for DISCOUNT
});

// GET /api/admin/promotions?q=
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  try {
    let query = supabaseAdmin
      .from("promotions")
      .select("*")
      .order("priority", { ascending: false })
      .order("code", { ascending: true });

    if (q) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }

    const { data: promotions, error } = await query;

    if (error) throw error;

    // Load scopes for all promotions
    if (promotions && promotions.length > 0) {
      const codes = promotions.map(p => p.code);
      const { data: scopes } = await supabaseAdmin
        .from("promotion_scopes")
        .select("promotion_code, category")
        .in("promotion_code", codes)
        .eq("scope_type", "CATEGORY")
        .eq("is_included", true);

      // Build map of code -> categories
      const scopeMap = new Map<string, string[]>();
      (scopes || []).forEach(s => {
        if (!scopeMap.has(s.promotion_code)) {
          scopeMap.set(s.promotion_code, []);
        }
        scopeMap.get(s.promotion_code)!.push(s.category);
      });

      // Attach scopes to promotions
      const promotionsWithScopes = promotions.map(p => ({
        ...p,
        scopes: scopeMap.get(p.code) || [],
      }));

      return NextResponse.json({ ok: true, promotions: promotionsWithScopes });
    }

    return NextResponse.json({ ok: true, promotions: [] });
  } catch (error: any) {
    console.error("GET /api/admin/promotions error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch promotions" },
      { status: 500 }
    );
  }
}

// POST /api/admin/promotions
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = createPromotionSchema.parse(body);

    const { scopes, ...promotionData } = validated;

    const { data, error } = await supabaseAdmin
      .from("promotions")
      .insert(promotionData)
      .select()
      .single();

    if (error) throw error;

    // Insert scopes if provided and promo_type is DISCOUNT
    if (scopes && scopes.length > 0 && data.promo_type === "DISCOUNT") {
      const scopeRows = scopes.map(category => ({
        promotion_code: data.code,
        scope_type: "CATEGORY",
        category,
        is_included: true,
      }));

      const { error: scopeError } = await supabaseAdmin
        .from("promotion_scopes")
        .insert(scopeRows);

      if (scopeError) {
        console.error("Failed to insert scopes:", scopeError);
      }
    }

    return NextResponse.json({ ok: true, promotion: { ...data, scopes: scopes || [] } });
  } catch (error: any) {
    console.error("POST /api/admin/promotions error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create promotion" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/promotions
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = patchPromotionSchema.parse(body);

    const { data, error } = await supabaseAdmin
      .from("promotions")
      .update(validated.patch)
      .eq("code", validated.code)
      .select()
      .single();

    if (error) throw error;

    // Handle scopes update if provided
    if (validated.scopes !== undefined) {
      // Delete existing scopes
      await supabaseAdmin
        .from("promotion_scopes")
        .delete()
        .eq("promotion_code", validated.code)
        .eq("scope_type", "CATEGORY");

      // Insert new scopes if promo is DISCOUNT and scopes provided
      if (validated.scopes.length > 0 && data.promo_type === "DISCOUNT") {
        const scopeRows = validated.scopes.map(category => ({
          promotion_code: validated.code,
          scope_type: "CATEGORY",
          category,
          is_included: true,
        }));

        const { error: scopeError } = await supabaseAdmin
          .from("promotion_scopes")
          .insert(scopeRows);

        if (scopeError) {
          console.error("Failed to insert scopes:", scopeError);
        }
      }
    }

    return NextResponse.json({ ok: true, promotion: { ...data, scopes: validated.scopes || [] } });
  } catch (error: any) {
    console.error("PATCH /api/admin/promotions error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update promotion" },
      { status: 500 }
    );
  }
}
