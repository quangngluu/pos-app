import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

// Validation schemas
const createSubcategorySchema = z.object({
  category_code: z.string().min(1, "Category code is required"),
  name: z.string().min(1, "Name is required").max(200),
  sort_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const updateSubcategorySchema = z.object({
  id: z.string().uuid("Invalid subcategory ID"),
  patch: z.object({
    name: z.string().min(1).max(200).optional(),
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  }),
});

/**
 * GET /api/admin/subcategories?category_code=&q=
 * List subcategories (optionally filtered by category)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryCode = searchParams.get("category_code") || "";
    const q = searchParams.get("q") || "";

    let query = supabaseAdmin
      .from("subcategories")
      .select("*, categories(code, name)")
      .order("category_code", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (categoryCode.trim()) {
      query = query.eq("category_code", categoryCode.trim().toUpperCase());
    }

    if (q.trim()) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Subcategories] GET error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, subcategories: data || [] });
  } catch (e: any) {
    console.error("[Subcategories] GET exception:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/subcategories
 * Create new subcategory
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate with zod
    const validated = createSubcategorySchema.parse(body);
    
    const normalizedCategoryCode = validated.category_code.trim().toUpperCase();
    const normalizedName = validated.name.trim();

    // Check if category exists
    const { data: category } = await supabaseAdmin
      .from("categories")
      .select("code")
      .eq("code", normalizedCategoryCode)
      .maybeSingle();

    if (!category) {
      return NextResponse.json({ 
        ok: false, 
        error: "Category not found",
        detail: `Category ${normalizedCategoryCode} does not exist`
      }, { status: 400 });
    }

    // Check if subcategory already exists (unique constraint: category_code + name)
    const { data: existing } = await supabaseAdmin
      .from("subcategories")
      .select("id")
      .eq("category_code", normalizedCategoryCode)
      .eq("name", normalizedName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ 
        ok: false, 
        error: "Subcategory already exists",
        detail: `Subcategory "${normalizedName}" already exists in category ${normalizedCategoryCode}`
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("subcategories")
      .insert({
        category_code: normalizedCategoryCode,
        name: normalizedName,
        sort_order: validated.sort_order,
        is_active: validated.is_active,
      })
      .select("*, categories(code, name)")
      .single();

    if (error) {
      console.error("[Subcategories] POST error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details 
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Subcategories] POST exception:", e);
    
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
 * PATCH /api/admin/subcategories
 * Update existing subcategory
 * Body: { id, patch: { name?, sort_order?, is_active? } }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    
    // Validate with zod
    const validated = updateSubcategorySchema.parse(body);

    if (!Object.keys(validated.patch).length) {
      return NextResponse.json({ 
        ok: false, 
        error: "No fields to update" 
      }, { status: 400 });
    }

    // If updating name, check uniqueness within category
    if (validated.patch.name) {
      const { data: subcategory } = await supabaseAdmin
        .from("subcategories")
        .select("category_code")
        .eq("id", validated.id)
        .maybeSingle();

      if (!subcategory) {
        return NextResponse.json({ 
          ok: false, 
          error: "Subcategory not found" 
        }, { status: 404 });
      }

      const { data: existing } = await supabaseAdmin
        .from("subcategories")
        .select("id")
        .eq("category_code", subcategory.category_code)
        .eq("name", validated.patch.name.trim())
        .neq("id", validated.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ 
          ok: false, 
          error: "Subcategory name already exists",
          detail: `A subcategory with name "${validated.patch.name}" already exists in this category`
        }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("subcategories")
      .update(validated.patch)
      .eq("id", validated.id)
      .select("*, categories(code, name)")
      .single();

    if (error) {
      console.error("[Subcategories] PATCH error:", error);
      return NextResponse.json({ 
        ok: false, 
        error: error.message,
        detail: error.details 
      }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ 
        ok: false, 
        error: "Subcategory not found" 
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[Subcategories] PATCH exception:", e);
    
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
