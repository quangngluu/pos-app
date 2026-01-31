import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

// Validation schemas
const createCategorySchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  sort_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const updateCategorySchema = z.object({
  code: z.string().min(1, "Code is required"),
  patch: z.object({
    name: z.string().min(1).max(200).optional(),
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  }),
});

/**
 * GET /api/admin/categories
 * List all categories (with optional search)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    let query = supabaseAdmin
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (q.trim()) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Categories] GET error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, categories: data || [] });
  } catch (e: any) {
    console.error("[Categories] GET exception:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/categories
 * Create new category
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate with zod
    const validated = createCategorySchema.parse(body);
    
    const normalizedCode = validated.code.trim().toUpperCase();

    // Check if code already exists
    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("code")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ 
        ok: false, 
        error: "Category code already exists",
        detail: `Code ${normalizedCode} is already in use`
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert({
        code: normalizedCode,
        name: validated.name.trim(),
        sort_order: validated.sort_order,
        is_active: validated.is_active,
      })
      .select()
      .single();

    if (error) {
      console.error("[Categories] POST error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details 
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Categories] POST exception:", e);
    
    if (e instanceof z.ZodError) {
      return NextResponse.json({ 
        ok: false, 
        error: "Validation failed",
        detail: e.issues 
      }, { status: 400 });
    }
    
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/categories
 * Update existing category
 * Body: { code, patch: { name?, sort_order?, is_active? } }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    
    // Validate with zod
    const validated = updateCategorySchema.parse(body);

    if (!Object.keys(validated.patch).length) {
      return NextResponse.json({ 
        ok: false, 
        error: "No fields to update" 
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .update(validated.patch)
      .eq("code", validated.code)
      .select()
      .single();

    if (error) {
      console.error("[Categories] PATCH error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details 
      }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ 
        ok: false, 
        error: "Category not found" 
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Categories] PATCH exception:", e);
    
    if (e instanceof z.ZodError) {
      return NextResponse.json({ 
        ok: false, 
        error: "Validation failed",
        detail: e.issues 
      }, { status: 400 });
    }
    
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
