import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/lib/requireAuth";

// Validation schemas
const sizeKeyEnum = z.enum(["STD", "SIZE_PHE", "SIZE_LA"]);

const createVariantSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  size_key: sizeKeyEnum,
  sku_code: z.string().min(1, "SKU code is required"),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).optional().default(0),
  price_vat_incl: z.number().min(0, "Price must be non-negative"),
});

const updateVariantSchema = z.object({
  id: z.string().uuid("Invalid variant ID"),
  patch: z.object({
    sku_code: z.string().min(1).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  }),
  price_vat_incl: z.number().min(0, "Price must be non-negative").optional(),
});

/**
 * GET /api/admin/variants?product_id=
 * List product variants with prices
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");

  try {
    let query = supabaseAdmin
      .from("product_variants")
      .select(`
        id,
        product_id,
        size_key,
        sku_code,
        is_active,
        sort_order,
        created_at,
        product_variant_prices (
          price_vat_incl,
          updated_at
        ),
        products (
          code,
          name
        )
      `)
      .order("sort_order", { ascending: true });

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Flatten the response
    const variants = (data || []).map(v => {
      const product = Array.isArray(v.products) ? v.products[0] : v.products;
      const priceRecord = Array.isArray(v.product_variant_prices) 
        ? v.product_variant_prices[0] 
        : v.product_variant_prices;
      
      return {
        id: v.id,
        product_id: v.product_id,
        product_code: product?.code,
        product_name: product?.name,
        size_key: v.size_key,
        sku_code: v.sku_code,
        is_active: v.is_active,
        sort_order: v.sort_order,
        created_at: v.created_at,
        price_vat_incl: priceRecord?.price_vat_incl,
        price_updated_at: priceRecord?.updated_at,
      };
    });
    return NextResponse.json({ ok: true, variants });
  } catch (error: any) {
    console.error("GET /api/admin/variants error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch variants" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/variants
 * Create new product variant with price
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = createVariantSchema.parse(body);

    // Check if product exists
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, code")
      .eq("id", validated.product_id)
      .maybeSingle();

    if (!product) {
      return NextResponse.json(
        { ok: false, error: "Product not found" },
        { status: 404 }
      );
    }

    // Check for duplicate SKU code
    const { data: existingSku } = await supabaseAdmin
      .from("product_variants")
      .select("id, sku_code")
      .eq("sku_code", validated.sku_code)
      .maybeSingle();

    if (existingSku) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "SKU code already exists",
          detail: `SKU ${validated.sku_code} is already in use`
        },
        { status: 400 }
      );
    }

    // Check for duplicate (product_id, size_key)
    const { data: existingVariant } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("product_id", validated.product_id)
      .eq("size_key", validated.size_key)
      .maybeSingle();

    if (existingVariant) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "Variant already exists",
          detail: `Product ${product.code} already has a ${validated.size_key} variant`
        },
        { status: 400 }
      );
    }

    // Create variant
    const { data: variant, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .insert({
        product_id: validated.product_id,
        size_key: validated.size_key,
        sku_code: validated.sku_code,
        is_active: validated.is_active,
        sort_order: validated.sort_order,
      })
      .select()
      .single();

    if (variantError) throw variantError;

    // Create price
    const { error: priceError } = await supabaseAdmin
      .from("product_variant_prices")
      .insert({
        variant_id: variant.id,
        price_vat_incl: validated.price_vat_incl,
      });

    if (priceError) {
      // Rollback variant if price insert fails
      await supabaseAdmin
        .from("product_variants")
        .delete()
        .eq("id", variant.id);
      throw priceError;
    }

    // Fetch complete data
    const { data: completeVariant } = await supabaseAdmin
      .from("product_variants")
      .select(`
        *,
        product_variant_prices(price_vat_incl, updated_at),
        products(code, name)
      `)
      .eq("id", variant.id)
      .single();

    return NextResponse.json({ ok: true, data: completeVariant });
  } catch (error: any) {
    console.error("POST /api/admin/variants error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", detail: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create variant" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/variants
 * Update variant and/or its price
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = updateVariantSchema.parse(body);

    // Check if variant exists
    const { data: existingVariant } = await supabaseAdmin
      .from("product_variants")
      .select("id, sku_code")
      .eq("id", validated.id)
      .maybeSingle();

    if (!existingVariant) {
      return NextResponse.json(
        { ok: false, error: "Variant not found" },
        { status: 404 }
      );
    }

    // If updating SKU code, check for duplicates
    if (validated.patch.sku_code && validated.patch.sku_code !== existingVariant.sku_code) {
      const { data: duplicateSku } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("sku_code", validated.patch.sku_code)
        .neq("id", validated.id)
        .maybeSingle();

      if (duplicateSku) {
        return NextResponse.json(
          { 
            ok: false, 
            error: "SKU code already exists",
            detail: `SKU ${validated.patch.sku_code} is already in use`
          },
          { status: 400 }
        );
      }
    }

    // Update variant if there are changes
    if (Object.keys(validated.patch).length > 0) {
      const { error: variantError } = await supabaseAdmin
        .from("product_variants")
        .update(validated.patch)
        .eq("id", validated.id);

      if (variantError) throw variantError;
    }

    // Update price if provided
    if (validated.price_vat_incl !== undefined) {
      const { error: priceError } = await supabaseAdmin
        .from("product_variant_prices")
        .upsert({
          variant_id: validated.id,
          price_vat_incl: validated.price_vat_incl,
          updated_at: new Date().toISOString(),
        });

      if (priceError) throw priceError;
    }

    // Fetch updated data
    const { data: updatedVariant } = await supabaseAdmin
      .from("product_variants")
      .select(`
        *,
        product_variant_prices(price_vat_incl, updated_at),
        products(code, name)
      `)
      .eq("id", validated.id)
      .single();

    return NextResponse.json({ ok: true, data: updatedVariant });
  } catch (error: any) {
    console.error("PATCH /api/admin/variants error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", detail: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update variant" },
      { status: 500 }
    );
  }
}
