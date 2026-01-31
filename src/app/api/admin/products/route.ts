import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/lib/requireAuth";

// Validation schemas
const pricesSchema = z.object({
  STD: z.number().min(0).optional().nullable(),
  SIZE_PHE: z.number().min(0).optional().nullable(),
  SIZE_LA: z.number().min(0).optional().nullable(),
});

const createProductSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  category_code: z.string().optional().nullable(),
  subcategory_id: z.string().uuid().optional().nullable(),
  menu_section: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  prices: pricesSchema.optional(),
});

const patchProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  patch: z.object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category_code: z.string().optional().nullable(),
    subcategory_id: z.string().uuid().optional().nullable(),
    menu_section: z.string().optional().nullable(),
    is_active: z.boolean().optional(),
  }),
  prices: pricesSchema.optional(),
  priceMode: z.enum(["single", "multi"]).optional(), // Track pricing mode to clean up unused keys
});

type PriceKey = "STD" | "SIZE_PHE" | "SIZE_LA";

// GET /api/admin/products?q=&category=&active=
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const active = searchParams.get("active");

  try {
    // Use * to handle optional columns that may not exist yet (subcategory_id, menu_section)
    let query = supabaseAdmin
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
    }

    if (category) {
      // Try category_code first, fallback to legacy category column
      const categoryFilter = `category_code.eq.${category},category.eq.${category}`;
      query = query.or(categoryFilter);
    }

    if (active !== null && active !== undefined && active !== "") {
      query = query.eq("is_active", active === "true");
    }

    const { data: products, error: productsError } = await query;

    if (productsError) throw productsError;

    if (!products || products.length === 0) {
      return NextResponse.json({ ok: true, products: [] });
    }

    // Fetch prices for all products (from variants first, fallback to legacy)
    const productIds = products.map((p) => p.id);
    
    // Try variant pricing first
    const { data: variantsData, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select(`
        product_id,
        size_key,
        product_variant_prices(price_vat_incl)
      `)
      .in("product_id", productIds)
      .eq("is_active", true);

    if (variantsError) throw variantsError;

    // Build price map from variants
    const pricesMap = new Map<string, Record<string, number>>();
    const productsWithVariants = new Set<string>();
    
    (variantsData || []).forEach((v) => {
      if (!pricesMap.has(v.product_id)) {
        pricesMap.set(v.product_id, {});
      }
      productsWithVariants.add(v.product_id);
      
      const priceRecord = Array.isArray(v.product_variant_prices)
        ? v.product_variant_prices[0]
        : v.product_variant_prices;
      
      if (priceRecord?.price_vat_incl != null) {
        pricesMap.get(v.product_id)![v.size_key] = Number(priceRecord.price_vat_incl);
      }
    });

    // Fallback to legacy product_prices for products without variants
    const productsNeedingLegacy = productIds.filter(id => !productsWithVariants.has(id));
    if (productsNeedingLegacy.length > 0) {
      const { data: legacyPrices } = await supabaseAdmin
        .from("product_prices")
        .select("product_id, price_key, price_vat_incl")
        .in("product_id", productsNeedingLegacy)
        .in("price_key", ["STD", "SIZE_PHE", "SIZE_LA"]);

      (legacyPrices || []).forEach((row) => {
        if (!pricesMap.has(row.product_id)) {
          pricesMap.set(row.product_id, {});
        }
        pricesMap.get(row.product_id)![row.price_key] = Number(row.price_vat_incl);
      });
    }

    // Compose response
    const result = products.map((product) => ({
      ...product,
      prices: pricesMap.get(product.id) || {},
    }));

    return NextResponse.json({ ok: true, products: result });
  } catch (error: any) {
    console.error("GET /api/admin/products error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST /api/admin/products
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = createProductSchema.parse(body);

    // Insert product - build insert object dynamically to handle missing columns
    const insertData: any = {
      code: validated.code,
      name: validated.name,
      is_active: validated.is_active,
    };

    // Add optional columns if they're provided (handle migration state)
    if (validated.category_code !== undefined) {
      insertData.category_code = validated.category_code;
    }
    if (validated.subcategory_id !== undefined) {
      insertData.subcategory_id = validated.subcategory_id;
    }
    if (validated.menu_section !== undefined) {
      insertData.menu_section = validated.menu_section;
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .insert(insertData)
      .select()
      .single();

    if (productError) throw productError;

    // Upsert prices if provided
    if (validated.prices) {
      const priceKeys: PriceKey[] = ["STD", "SIZE_PHE", "SIZE_LA"];
      const priceRows: any[] = [];

      priceKeys.forEach((key) => {
        const value = validated.prices![key];
        if (typeof value === "number" && isFinite(value)) {
          priceRows.push({
            product_id: product.id,
            price_key: key,
            price_vat_incl: value,
          });
        }
      });

      if (priceRows.length > 0) {
        const { error: pricesError } = await supabaseAdmin
          .from("product_prices")
          .upsert(priceRows, { onConflict: "product_id,price_key" });

        if (pricesError) throw pricesError;
      }
    }

    return NextResponse.json({ ok: true, product });
  } catch (error: any) {
    console.error("POST /api/admin/products error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create product" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/products
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = patchProductSchema.parse(body);

    // Update product if patch fields provided
    if (Object.keys(validated.patch).length > 0) {
      const { error: productError } = await supabaseAdmin
        .from("products")
        .update(validated.patch)
        .eq("id", validated.id);

      if (productError) throw productError;
    }

    // Upsert prices if provided
    if (validated.prices) {
      const priceKeys: PriceKey[] = ["STD", "SIZE_PHE", "SIZE_LA"];
      const priceRows: any[] = [];
      const keysToKeep: string[] = [];

      priceKeys.forEach((key) => {
        const value = validated.prices![key];
        if (typeof value === "number" && isFinite(value)) {
          priceRows.push({
            product_id: validated.id,
            price_key: key,
            price_vat_incl: value,
          });
          keysToKeep.push(key);
        }
      });

      // Delete prices not in the current mode (clean up unused keys)
      if (validated.priceMode) {
        const keysToDelete: string[] = [];
        
        if (validated.priceMode === "single") {
          // Single mode: only keep STD, remove SIZE_PHE and SIZE_LA
          keysToDelete.push("SIZE_PHE", "SIZE_LA");
        } else if (validated.priceMode === "multi") {
          // Multi mode: keep provided keys, remove others not provided
          priceKeys.forEach((key) => {
            if (!keysToKeep.includes(key)) {
              keysToDelete.push(key);
            }
          });
        }

        if (keysToDelete.length > 0) {
          await supabaseAdmin
            .from("product_prices")
            .delete()
            .eq("product_id", validated.id)
            .in("price_key", keysToDelete);
        }
      }

      if (priceRows.length > 0) {
        const { error: pricesError } = await supabaseAdmin
          .from("product_prices")
          .upsert(priceRows, { onConflict: "product_id,price_key" });

        if (pricesError) throw pricesError;
      }
    }

    // Fetch updated product
    const { data: product, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json({ ok: true, product });
  } catch (error: any) {
    console.error("PATCH /api/admin/products error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update product" },
      { status: 500 }
    );
  }
}
