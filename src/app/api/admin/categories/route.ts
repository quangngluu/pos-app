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
 * Backward compatible: tries categories table first, falls back to product_categories
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    // Try new categories table first
    let query = supabaseAdmin
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (q.trim()) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }

    const { data, error } = await query;

    // If categories table doesn't exist or is empty, try legacy table
    if ((error && error.message.includes("does not exist")) || (!error && (!data || data.length === 0))) {
      let legacyQuery = supabaseAdmin
        .from("product_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (q.trim()) {
        legacyQuery = legacyQuery.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
      }

      const { data: legacyData, error: legacyError } = await legacyQuery;

      if (legacyError) {
        console.error("[Categories] Legacy GET error:", legacyError);
        return NextResponse.json({ ok: false, error: legacyError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, categories: legacyData || [] });
    }

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
 * Backward compatible: writes to both tables if product_categories exists
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate with zod
    const validated = createCategorySchema.parse(body);
    
    const normalizedCode = validated.code.trim().toUpperCase();

    // Try new table first
    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("code")
      .eq("code", normalizedCode)
      .maybeSingle();

    // Also check legacy table
    const { data: legacyExisting } = await supabaseAdmin
      .from("product_categories")
      .select("code")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (existing || legacyExisting) {
      return NextResponse.json({ 
        ok: false, 
        error: "Category code already exists",
        detail: `Code ${normalizedCode} is already in use`
      }, { status: 400 });
    }

    const categoryData = {
      code: normalizedCode,
      name: validated.name.trim(),
      sort_order: validated.sort_order,
      is_active: validated.is_active,
    };

    // Try to insert into new table
    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert(categoryData)
      .select()
      .single();

    // If new table doesn't exist, use legacy table
    if (error && error.message.includes("does not exist")) {
      const { data: legacyData, error: legacyError } = await supabaseAdmin
        .from("product_categories")
        .insert(categoryData)
        .select()
        .single();

      if (legacyError) {
        console.error("[Categories] Legacy POST error:", legacyError);
        return NextResponse.json({ 
          ok: false, 
          error: legacyError.message,
          detail: legacyError.details 
        }, { status: 500 });
      }

      return NextResponse.json({ ok: true, data: legacyData });
    }

    if (error) {
      console.error("[Categories] POST error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details 
      }, { status: 500 });
    }

    // Also insert into legacy table for backward compatibility (if it exists)
    await supabaseAdmin
      .from("product_categories")
      .insert(categoryData)
      .select()
      .single();

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
 * Backward compatible: updates both tables if they exist
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

    // Try new table first
    const { data, error } = await supabaseAdmin
      .from("categories")
      .update(validated.patch)
      .eq("code", validated.code)
      .select()
      .single();

    // If new table doesn't exist, use legacy table
    if (error && error.message.includes("does not exist")) {
      const { data: legacyData, error: legacyError } = await supabaseAdmin
        .from("product_categories")
        .update(validated.patch)
        .eq("code", validated.code)
        .select()
        .single();

      if (legacyError) {
        console.error("[Categories] Legacy PATCH error:", legacyError);
        return NextResponse.json({ 
          ok: false, 
          error: legacyError.message,
          detail: legacyError.details 
        }, { status: 500 });
      }

      if (!legacyData) {
        return NextResponse.json({ 
          ok: false, 
          error: "Category not found" 
        }, { status: 404 });
      }

      return NextResponse.json({ ok: true, data: legacyData });
    }

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

    // Also update legacy table (if it exists)
    await supabaseAdmin
      .from("product_categories")
      .update(validated.patch)
      .eq("code", validated.code);

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
