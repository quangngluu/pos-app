import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

// Validation schemas
const createMappingSchema = z.object({
  category_code: z.string().min(1, "Category code is required"),
  menu_section: z.string().min(1, "Menu section is required"),
  sku_code: z.string().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
});

const updateMappingSchema = z.object({
  id: z.number().int().positive(),
  category_code: z.string().min(1, "Category code is required"),
  menu_section: z.string().min(1, "Menu section is required"),
  sku_code: z.string().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/admin/product-mapping
 * List all product category mappings
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryCode = searchParams.get("category_code") || "";

    let query = supabaseAdmin
      .from("product_categories")
      .select("*, subcategories(id, name)")
      .order("category_code", { ascending: true })
      .order("menu_section", { ascending: true });

    if (categoryCode.trim()) {
      query = query.eq("category_code", categoryCode.trim().toUpperCase());
    }

    const { data, error } = await query;

    if (error) {
      console.error("[ProductMapping] GET error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Transform to include subcategory info
    const mappings = (data || []).map((row: any) => ({
      id: row.id,
      category_code: row.category_code,
      menu_section: row.menu_section,
      sku_code: row.sku_code,
      subcategory_id: row.subcategory_id,
      subcategory: row.subcategories || null,
    }));

    return NextResponse.json({ ok: true, mappings });
  } catch (e: any) {
    console.error("[ProductMapping] GET exception:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/product-mapping
 * Create new product category mapping
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = createMappingSchema.parse(body);

    const mappingData = {
      category_code: validated.category_code.trim().toUpperCase(),
      menu_section: validated.menu_section.trim().toUpperCase(),
      sku_code: validated.sku_code?.trim().toUpperCase() || null,
      subcategory_id: validated.subcategory_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from("product_categories")
      .insert(mappingData)
      .select("*, subcategories(id, name)")
      .single();

    if (error) {
      console.error("[ProductMapping] POST error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[ProductMapping] POST exception:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Validation failed", detail: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/product-mapping
 * Update existing product category mapping
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const validated = updateMappingSchema.parse(body);

    const updateData = {
      category_code: validated.category_code.trim().toUpperCase(),
      menu_section: validated.menu_section.trim().toUpperCase(),
      sku_code: validated.sku_code?.trim().toUpperCase() || null,
      subcategory_id: validated.subcategory_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from("product_categories")
      .update(updateData)
      .eq("id", validated.id)
      .select("*, subcategories(id, name)")
      .single();

    if (error) {
      console.error("[ProductMapping] PUT error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[ProductMapping] PUT exception:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Validation failed", detail: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/product-mapping
 * Delete product category mapping
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id parameter" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("product_categories")
      .delete()
      .eq("id", parseInt(id));

    if (error) {
      console.error("[ProductMapping] DELETE error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[ProductMapping] DELETE exception:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
