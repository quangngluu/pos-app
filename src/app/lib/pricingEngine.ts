/**
 * Shared Pricing Engine
 * 
 * Purpose: Single source of truth for order pricing logic.
 * - Used by /api/quote for preview
 * - Used by /api/orders for server-side recomputation (don't trust client)
 * 
 * CRITICAL: Server must recompute all pricing to prevent manipulation.
 */

import { supabaseAdmin } from "./supabaseAdmin";

/* =========================
   Types
========================= */

export type QuoteLine = {
  line_id: string;
  product_id: string;
  qty: number;
  price_key: string; // For pricing calculation (may differ from display for FREE_UPSIZE)
  options?: Record<string, string>;
};

export type QuoteLineResult = {
  line_id: string;
  product_id: string;
  qty: number;
  display_price_key?: string; // What UI shows (LA for free upsize)
  charged_price_key?: string; // What we charge (PHE for free upsize)
  unit_price_before?: number;
  unit_price_after?: number;
  line_total_before?: number;
  line_total_after?: number;
  adjustments?: { type: string; amount: number }[];
  missing_price?: boolean;
  // Debug fields (dev mode only)
  debug?: {
    product_category?: string | null;
    normalized_category?: string;
    is_eligible_for_promo?: boolean;
  };
};

export type QuoteResult = {
  ok: boolean;
  lines: QuoteLineResult[];
  totals: {
    subtotal_before: number;
    discount_total: number;
    grand_total: number;
  };
  meta: {
    free_upsize_applied?: boolean;
    discount_percent?: number;
    drink_qty?: number;
  };
  error?: string;
};

/* =========================
   Helpers
========================= */

const money = (n: any) => Math.max(0, Math.round(Number(n || 0)));

const key = (pid: string, priceKey: string) => `${pid}|${priceKey}`;

/**
 * Normalize category strings to canonical values for deterministic matching.
 * Maps various category names/codes to standard categories.
 */
function normalizeCategory(cat: string | null | undefined): string {
  if (!cat) return "UNKNOWN";
  
  const c = String(cat).trim().toUpperCase();
  
  // Remove diacritics for Vietnamese text
  const normalized = c
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D");
  
  // DRINK variants
  if (
    normalized === "DRINK" ||
    normalized === "DRK" ||
    normalized === "DO_UONG" ||
    normalized === "DO UONG" ||
    normalized === "DOUONG" ||
    normalized.startsWith("DRINK")
  ) {
    return "DRINK";
  }
  
  // CAKE variants
  if (
    normalized === "CAKE" ||
    normalized === "BANH" ||
    normalized.startsWith("CAKE")
  ) {
    return "CAKE";
  }
  
  // TOPPING variants
  if (
    normalized === "TOPPING" ||
    normalized === "TOP" ||
    normalized.startsWith("TOPPING")
  ) {
    return "TOPPING";
  }
  
  // MERCHANDISE variants
  if (
    normalized === "MERCHANDISE" ||
    normalized === "MERCH" ||
    normalized === "MER" ||
    normalized.startsWith("MERCHANDISE")
  ) {
    return "MERCHANDISE";
  }
  
  // PCTC (if exists)
  if (normalized === "PCTC" || normalized.startsWith("PCTC")) {
    return "PCTC";
  }
  
  // Return normalized uppercase or UNKNOWN
  return normalized || "UNKNOWN";
}

/* =========================
   Main Engine
========================= */

export async function quoteOrder(input: {
  promotion_code?: string | null;
  lines: QuoteLine[];
}): Promise<QuoteResult> {
  try {
    const { promotion_code, lines } = input;

    if (!lines || lines.length === 0) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: "No lines provided",
      };
    }

    const productIds = [...new Set(lines.map(l => l.product_id))];

    /* =========================
       Load data in parallel
    ========================= */
    const [productsResult, variantsResult, legacyPricesResult, promoResult] = await Promise.all([
      // Load products with category_code (primary) and category (legacy fallback)
      // Use * to handle columns that may not exist yet pre-migration
      supabaseAdmin
        .from("products")
        .select("*")
        .in("id", productIds)
        .eq("is_active", true),
      // Load variant pricing (source of truth)
      supabaseAdmin
        .from("product_variants")
        .select(`
          id,
          product_id,
          size_key,
          sku_code,
          is_active,
          product_variant_prices (
            price_vat_incl
          )
        `)
        .in("product_id", productIds)
        .eq("is_active", true),
      // Load legacy pricing as fallback
      supabaseAdmin
        .from("product_prices")
        .select("product_id, price_key, price_vat_incl")
        .in("product_id", productIds),
      promotion_code
        ? supabaseAdmin
            .from("promotions")
            .select("*")
            .eq("code", promotion_code)
            .eq("is_active", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (productsResult.error) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: `Products error: ${productsResult.error.message}`,
      };
    }

    if (variantsResult.error) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: `Variants error: ${variantsResult.error.message}`,
      };
    }

    if (legacyPricesResult.error) {
      return {
        ok: false,
        lines: [],
        totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
        meta: {},
        error: `Prices error: ${legacyPricesResult.error.message}`,
      };
    }

    // Build product map with category_code as primary, category as fallback
    const productMap = new Map(
      (productsResult.data ?? []).map(p => [p.id, {
        id: p.id,
        // Use category_code if it exists, otherwise fallback to category (handles pre-migration state)
        category: (p as any).category_code ?? p.category,
      }])
    );

    // Build price map: prefer variant pricing, fallback to legacy product_prices
    const priceMap = new Map<string, number>();
    
    // First, load variant pricing (source of truth)
    (variantsResult.data ?? []).forEach(v => {
      // Map size_key to price_key format for compatibility
      const priceKey = v.size_key; // STD, SIZE_PHE, SIZE_LA
      const priceRecord = Array.isArray(v.product_variant_prices) 
        ? v.product_variant_prices[0] 
        : v.product_variant_prices;
      
      if (priceRecord?.price_vat_incl != null) {
        priceMap.set(key(v.product_id, priceKey), money(priceRecord.price_vat_incl));
      }
    });

    // Fallback: load legacy pricing for products without variant pricing
    const productsWithVariantPricing = new Set(
      (variantsResult.data ?? []).map(v => v.product_id)
    );
    
    (legacyPricesResult.data ?? []).forEach(p => {
      // Only use legacy pricing if product has no variant pricing
      if (!productsWithVariantPricing.has(p.product_id)) {
        priceMap.set(key(p.product_id, p.price_key), money(p.price_vat_incl));
      }
    });

    let promo = promoResult.data;

    // Validate promotion time window
    if (promo) {
      const now = new Date();
      if (promo.valid_from && new Date(promo.valid_from) > now) {
        promo = null; // Not yet valid
      }
      if (promo?.valid_until && new Date(promo.valid_until) < now) {
        promo = null; // Expired
      }
    }

    /* =========================
       LOAD PROMOTION SCOPES
    ========================= */
    let includedCategories: string[] = [];
    let excludedCategories: string[] = [];
    let includeProductIds: string[] = [];

    if (promo && promo.code) {
      // Load CATEGORY scopes
      const { data: scopes } = await supabaseAdmin
        .from("promotion_scopes")
        .select("scope_type, category, is_included")
        .eq("promotion_code", promo.code);

      if (scopes && scopes.length > 0) {
        scopes.forEach(s => {
          if (s.scope_type === "CATEGORY") {
            if (s.is_included) {
              includedCategories.push(s.category);
            } else {
              excludedCategories.push(s.category);
            }
          }
        });
      }

      // Load PRODUCT targets (is_enabled=true acts as include list)
      const { data: targets } = await supabaseAdmin
        .from("promotion_targets")
        .select("product_id")
        .eq("promotion_code", promo.code)
        .eq("is_enabled", true);

      if (targets && targets.length > 0) {
        includeProductIds = targets.map(t => t.product_id);
      }
    }

    const normalizedIncluded = includedCategories
      .map(normalizeCategory)
      .filter(c => c !== "UNKNOWN");
    
    const normalizedExcluded = excludedCategories
      .map(normalizeCategory)
      .filter(c => c !== "UNKNOWN");

    // BUSINESS RULE: If NO included scopes (category or product), apply NONE
    const hasIncludeScope = normalizedIncluded.length > 0 || includeProductIds.length > 0;
    
    const discountRate =
      promo?.promo_type === "DISCOUNT" && hasIncludeScope
        ? Number(promo.percent_off ?? 0) / 100
        : 0;
    
    // Dev mode flag
    const isDev = process.env.NODE_ENV !== "production";

    // Debug logging (dev/non-prod only)
    if (isDev && promo) {
      console.log("[PricingEngine] Promotion:", {
        code: promo.code,
        type: promo.promo_type,
        includedCategories: normalizedIncluded,
        excludedCategories: normalizedExcluded,
        includeProductIds: includeProductIds.length,
        hasIncludeScope,
        discountRate: discountRate * 100 + "%",
      });
    }

    /* =========================
       Price each line
    ========================= */
    let subtotalBefore = 0;
    let discountTotal = 0;
    let eligibleLineIds: string[] = [];

    // Helper: check if line is eligible for promotion
    const isLineEligible = (productId: string, productCategory: string): boolean => {
      if (!hasIncludeScope) return false; // No scopes = no eligibility
      if (productCategory === "UNKNOWN") return false; // Unknown category not eligible

      // Check PRODUCT include list
      if (includeProductIds.includes(productId)) {
        // Check if excluded by category
        return !normalizedExcluded.includes(productCategory);
      }

      // Check CATEGORY include list
      const isIncluded = normalizedIncluded.includes(productCategory);
      const isExcluded = normalizedExcluded.includes(productCategory);
      return isIncluded && !isExcluded;
    };

    // For FREE_UPSIZE: count qty only for eligible lines
    const eligibleDrinkQty = lines.reduce((s, l) => {
      const product = productMap.get(l.product_id);
      const cat = normalizeCategory(product?.category);
      if (cat !== "DRINK") return s;
      
      // If promotion has scopes, only count eligible drinks
      if (promo?.code === "FREE_UPSIZE_5" && hasIncludeScope) {
        return isLineEligible(l.product_id, cat) ? s + l.qty : s;
      }
      // No scopes: count all drinks (backward compatible)
      return s + l.qty;
    }, 0);

    const freeUpsize =
      promo?.code === "FREE_UPSIZE_5" &&
      promo.promo_type === "RULE" &&
      eligibleDrinkQty >= (promo.min_qty ?? 5);

    const outLines = lines.map(l => {
      const product = productMap.get(l.product_id);
      const rawCategory = product?.category; // Already resolved from category_code ?? category
      const productCategory = normalizeCategory(rawCategory);
      const isDrink = productCategory === "DRINK";

      // Check line eligibility for promotion
      const eligibleForPromo = promo ? isLineEligible(l.product_id, productCategory) : false;
      if (eligibleForPromo) {
        eligibleLineIds.push(l.line_id);
      }

      let displayKey = l.price_key;
      let chargedKey = l.price_key;

      // FREE_UPSIZE: display LA, charge PHE (only if eligible)
      const hasBothSizes =
        priceMap.has(key(l.product_id, "SIZE_PHE")) &&
        priceMap.has(key(l.product_id, "SIZE_LA"));

      if (
        freeUpsize &&
        isDrink &&
        eligibleForPromo &&
        l.price_key === "SIZE_PHE" &&
        hasBothSizes
      ) {
        displayKey = "SIZE_LA";
        chargedKey = "SIZE_PHE";
      }

      const unitBefore = priceMap.get(key(l.product_id, displayKey));
      const unitCharged = priceMap.get(key(l.product_id, chargedKey));

      if (!unitBefore || !unitCharged) {
        return {
          line_id: l.line_id,
          product_id: l.product_id,
          qty: l.qty,
          missing_price: true,
        };
      }

      // DISCOUNT: check eligibility
      const eligibleDiscount = discountRate > 0 && eligibleForPromo;

      const unitAfter = eligibleDiscount
        ? money(unitCharged * (1 - discountRate))
        : unitCharged;

      const lineBefore = unitBefore * l.qty;
      const lineAfter = unitAfter * l.qty;

      subtotalBefore += lineBefore;
      discountTotal += lineBefore - lineAfter;

      const adjustments = [];

      if (displayKey !== chargedKey) {
        adjustments.push({
          type: "FREE_UPSIZE",
          amount: (unitBefore - unitCharged) * l.qty,
        });
      }

      if (eligibleDiscount) {
        adjustments.push({
          type: "DISCOUNT",
          amount: (unitCharged - unitAfter) * l.qty,
        });
      }

      const result: QuoteLineResult = {
        line_id: l.line_id,
        product_id: l.product_id,
        qty: l.qty,
        display_price_key: displayKey,
        charged_price_key: chargedKey,
        unit_price_before: unitBefore,
        unit_price_after: unitAfter,
        line_total_before: lineBefore,
        line_total_after: lineAfter,
        adjustments,
      };

      // Add debug info in dev mode
      if (isDev) {
        result.debug = {
          product_category: rawCategory,
          normalized_category: productCategory,
          is_eligible_for_promo: eligibleForPromo,
        };
      }

      return result;
    });

    // Debug logging (dev/non-prod only)
    if (isDev && promo) {
      console.log("[PricingEngine] Results:", {
        eligibleLineIds: eligibleLineIds.length,
        totalLines: lines.length,
        subtotalBefore,
        discountTotal,
        grandTotal: subtotalBefore - discountTotal,
      });
    }

    return {
      ok: true,
      lines: outLines,
      totals: {
        subtotal_before: subtotalBefore,
        discount_total: discountTotal,
        grand_total: subtotalBefore - discountTotal,
      },
      meta: {
        free_upsize_applied: freeUpsize,
        discount_percent:
          promo?.promo_type === "DISCOUNT" && hasIncludeScope
            ? (promo?.percent_off ?? 0)
            : 0,
        drink_qty: eligibleDrinkQty,
      },
    };
  } catch (e: any) {
    return {
      ok: false,
      lines: [],
      totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
      meta: {},
      error: e?.message ?? "Unknown error",
    };
  }
}
