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
  adjustments?: { type: string; amount: number; details?: string }[];
  missing_price?: boolean;
  is_free_item?: boolean; // Flag for free gift items
  // Debug fields (dev mode only)
  debug?: {
    product_category?: string | null;
    normalized_category?: string;
    is_eligible_for_promo?: boolean;
    variant_id?: string;
  };
};

export type QuoteResult = {
  ok: boolean;
  lines: QuoteLineResult[];
  free_items?: QuoteLineResult[]; // Separate array for free gift items
  totals: {
    subtotal_before: number;
    discount_total: number;
    grand_total: number;
  };
  meta: {
    free_upsize_applied?: boolean;
    discount_percent?: number;
    drink_qty?: number;
    rules_applied?: string[]; // Track which rules were applied
    conditions_met?: Record<string, boolean>; // Debug: which conditions passed
  };
  error?: string;
};

// Rule contract types
type PromotionConditions = {
  min_order_value?: number;
  min_qty?: number;
  min_eligible_qty?: number;
};

type PromotionAction = 
  | { type: 'PERCENT_OFF'; percent: number; apply_to: 'ELIGIBLE_LINES' }
  | { type: 'AMOUNT_OFF'; amount: number; apply_to: 'ORDER_TOTAL' | 'ELIGIBLE_LINES'; allocation?: 'PROPORTIONAL' | 'EQUAL' }
  | { type: 'AMOUNT_OFF_PER_ITEM'; amount: number; max_items?: number }
  | { type: 'FREE_ITEM'; variant_id: string; qty: number; max_per_order?: number };

type PromotionRule = {
  id: string;
  promotion_code: string;
  rule_order: number;
  conditions: PromotionConditions | null;
  actions: PromotionAction[];
};

type ScopeTarget = {
  target_type: 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCT' | 'VARIANT';
  target_id: string;
  is_included: boolean;
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
       LOAD PROMOTION RULES & UNIFIED SCOPES
    ========================= */
    let scopeTargets: ScopeTarget[] = [];
    let promotionRules: PromotionRule[] = [];

    if (promo && promo.code) {
      // Try new unified scope table first
      const scopesResult = await supabaseAdmin
        .from("promotion_scope_targets")
        .select("target_type, target_id, is_included")
        .eq("promotion_code", promo.code);

      if (scopesResult.data && scopesResult.data.length > 0) {
        scopeTargets = scopesResult.data as ScopeTarget[];
      } else {
        // Fallback to legacy tables for backward compatibility
        // Load CATEGORY scopes from promotion_scopes
        const { data: legacyScopes } = await supabaseAdmin
          .from("promotion_scopes")
          .select("scope_type, category, is_included")
          .eq("promotion_code", promo.code);

        if (legacyScopes && legacyScopes.length > 0) {
          legacyScopes.forEach(s => {
            if (s.scope_type === "CATEGORY") {
              scopeTargets.push({
                target_type: "CATEGORY",
                target_id: s.category,
                is_included: s.is_included,
              });
            }
          });
        }

        // Load PRODUCT targets from promotion_targets
        const { data: legacyTargets } = await supabaseAdmin
          .from("promotion_targets")
          .select("product_id, is_enabled")
          .eq("promotion_code", promo.code);

        if (legacyTargets && legacyTargets.length > 0) {
          legacyTargets.forEach(t => {
            scopeTargets.push({
              target_type: "PRODUCT",
              target_id: t.product_id,
              is_included: t.is_enabled,
            });
          });
        }

        // Load VARIANT targets from promotion_target_variants
        const { data: legacyVariants } = await supabaseAdmin
          .from("promotion_target_variants")
          .select("variant_id, is_enabled")
          .eq("promotion_code", promo.code);

        if (legacyVariants && legacyVariants.length > 0) {
          legacyVariants.forEach(v => {
            scopeTargets.push({
              target_type: "VARIANT",
              target_id: v.variant_id,
              is_included: v.is_enabled,
            });
          });
        }
      }

      // Load promotion rules
      const rulesResult = await supabaseAdmin
        .from("promotion_rules")
        .select("*")
        .eq("promotion_code", promo.code)
        .order("rule_order", { ascending: true });

      if (rulesResult.data && rulesResult.data.length > 0) {
        promotionRules = rulesResult.data.map(r => ({
          id: r.id,
          promotion_code: r.promotion_code,
          rule_order: r.rule_order,
          conditions: r.conditions as PromotionConditions | null,
          actions: (Array.isArray(r.actions) ? r.actions : [r.actions]) as PromotionAction[],
        }));
      }
    }

    // Build include/exclude sets from unified scopes
    const includedCategories = scopeTargets
      .filter(t => t.target_type === "CATEGORY" && t.is_included)
      .map(t => t.target_id);
    
    const excludedCategories = scopeTargets
      .filter(t => t.target_type === "CATEGORY" && !t.is_included)
      .map(t => t.target_id);
    
    const includedSubcategories = scopeTargets
      .filter(t => t.target_type === "SUBCATEGORY" && t.is_included)
      .map(t => t.target_id);
    
    const excludedSubcategories = scopeTargets
      .filter(t => t.target_type === "SUBCATEGORY" && !t.is_included)
      .map(t => t.target_id);
    
    const includeProductIds = scopeTargets
      .filter(t => t.target_type === "PRODUCT" && t.is_included)
      .map(t => t.target_id);
    
    const excludeProductIds = scopeTargets
      .filter(t => t.target_type === "PRODUCT" && !t.is_included)
      .map(t => t.target_id);
    
    const includeVariantIds = scopeTargets
      .filter(t => t.target_type === "VARIANT" && t.is_included)
      .map(t => t.target_id);
    
    const excludeVariantIds = scopeTargets
      .filter(t => t.target_type === "VARIANT" && !t.is_included)
      .map(t => t.target_id);

    const normalizedIncluded = includedCategories
      .map(normalizeCategory)
      .filter(c => c !== "UNKNOWN");
    
    const normalizedExcluded = excludedCategories
      .map(normalizeCategory)
      .filter(c => c !== "UNKNOWN");

    // BUSINESS RULE: If NO included scopes (any type), apply NONE
    const hasIncludeScope = 
      includedCategories.length > 0 || 
      includedSubcategories.length > 0 || 
      includeProductIds.length > 0 || 
      includeVariantIds.length > 0;
    
    // Legacy discount rate for backward compatibility
    const legacyDiscountRate =
      promo?.promo_type === "DISCOUNT" && hasIncludeScope
        ? Number(promo.percent_off ?? 0) / 100
        : 0;
    
    // Dev mode flag
    const isDev = process.env.NODE_ENV !== "production";

    // Build variant map for eligibility checking (product_id -> variant_id)
    const variantMap = new Map<string, string>(); // key: product_id|size_key -> variant_id
    (variantsResult.data ?? []).forEach(v => {
      variantMap.set(key(v.product_id, v.size_key), v.id);
    });

    // Build product subcategory map
    const productSubcategoryMap = new Map<string, string>();
    (productsResult.data ?? []).forEach(p => {
      if ((p as any).subcategory_id) {
        productSubcategoryMap.set(p.id, (p as any).subcategory_id);
      }
    });

    // Debug logging (dev/non-prod only)
    if (isDev && promo) {
      console.log("[PricingEngine] Promotion:", {
        code: promo.code,
        type: promo.promo_type,
        includedCategories: normalizedIncluded,
        excludedCategories: normalizedExcluded,
        includeProductIds: includeProductIds.length,
        includeVariantIds: includeVariantIds.length,
        hasIncludeScope,
        rulesCount: promotionRules.length,
        legacyDiscountRate: legacyDiscountRate * 100 + "%",
      });
    }

    /* =========================
       Check Line Eligibility
    ========================= */
    let subtotalBefore = 0;
    let discountTotal = 0;
    let eligibleLineIds: string[] = [];

    // Helper: check if line is eligible for promotion (multi-level checking)
    const isLineEligible = (
      productId: string, 
      productCategory: string, 
      priceKey: string,
      subcategoryId?: string
    ): boolean => {
      if (!hasIncludeScope) return false; // No scopes = no eligibility
      if (productCategory === "UNKNOWN") return false; // Unknown category not eligible

      // Get variant ID for this line
      const variantId = variantMap.get(key(productId, priceKey));

      // Check VARIANT-level targeting (most specific)
      if (variantId) {
        if (includeVariantIds.includes(variantId)) {
          return !excludeVariantIds.includes(variantId); // Include unless explicitly excluded
        }
        if (excludeVariantIds.includes(variantId)) {
          return false; // Explicitly excluded
        }
      }

      // Check PRODUCT-level targeting
      if (includeProductIds.includes(productId)) {
        return !excludeProductIds.includes(productId); // Include unless explicitly excluded
      }
      if (excludeProductIds.includes(productId)) {
        return false; // Explicitly excluded
      }

      // Check SUBCATEGORY-level targeting
      if (subcategoryId) {
        if (includedSubcategories.includes(subcategoryId)) {
          return !excludedSubcategories.includes(subcategoryId);
        }
        if (excludedSubcategories.includes(subcategoryId)) {
          return false;
        }
      }

      // Check CATEGORY-level targeting (least specific)
      const isIncluded = normalizedIncluded.includes(productCategory);
      const isExcluded = normalizedExcluded.includes(productCategory);
      return isIncluded && !isExcluded;
    };

    // For FREE_UPSIZE: count qty only for eligible lines (backward compatibility)
    const eligibleDrinkQty = lines.reduce((s, l) => {
      const product = productMap.get(l.product_id);
      const cat = normalizeCategory(product?.category);
      const subcatId = productSubcategoryMap.get(l.product_id);
      if (cat !== "DRINK") return s;
      
      // If promotion has scopes, only count eligible drinks
      if (promo?.code === "FREE_UPSIZE_5" && hasIncludeScope) {
        return isLineEligible(l.product_id, cat, l.price_key, subcatId) ? s + l.qty : s;
      }
      // No scopes: count all drinks (backward compatible)
      return s + l.qty;
    }, 0);

    const freeUpsize =
      promo?.code === "FREE_UPSIZE_5" &&
      promo.promo_type === "RULE" &&
      eligibleDrinkQty >= (promo.min_qty ?? 5);

    /* =========================
       Price each line (before rules)
    ========================= */
    const outLines = lines.map(l => {
      const product = productMap.get(l.product_id);
      const rawCategory = product?.category; // Already resolved from category_code ?? category
      const productCategory = normalizeCategory(rawCategory);
      const subcategoryId = productSubcategoryMap.get(l.product_id);
      const isDrink = productCategory === "DRINK";
      const variantId = variantMap.get(key(l.product_id, l.price_key));

      // Check line eligibility for promotion
      const eligibleForPromo = promo ? isLineEligible(l.product_id, productCategory, l.price_key, subcategoryId) : false;
      if (eligibleForPromo) {
        eligibleLineIds.push(l.line_id);
      }

      let displayKey = l.price_key;
      let chargedKey = l.price_key;

      // FREE_UPSIZE: display LA, charge PHE (only if eligible) - BACKWARD COMPATIBILITY
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

      const lineBefore = unitBefore * l.qty;
      
      subtotalBefore += lineBefore;

      const adjustments: { type: string; amount: number; details?: string }[] = [];

      // FREE_UPSIZE adjustment (backward compatibility)
      if (displayKey !== chargedKey) {
        adjustments.push({
          type: "FREE_UPSIZE",
          amount: (unitBefore - unitCharged) * l.qty,
          details: "Legacy FREE_UPSIZE rule"
        });
      }

      const result: QuoteLineResult = {
        line_id: l.line_id,
        product_id: l.product_id,
        qty: l.qty,
        display_price_key: displayKey,
        charged_price_key: chargedKey,
        unit_price_before: unitBefore,
        unit_price_after: unitCharged, // Will be updated by rules
        line_total_before: lineBefore,
        line_total_after: lineBefore, // Will be updated by rules
        adjustments,
      };

      // Add debug info in dev mode
      if (isDev) {
        result.debug = {
          product_category: rawCategory,
          normalized_category: productCategory,
          is_eligible_for_promo: eligibleForPromo,
          variant_id: variantId,
        };
      }

      return result;
    });

    /* =========================
       Apply Promotion Rules
    ========================= */
    const rulesApplied: string[] = [];
    const conditionsMet: Record<string, boolean> = {};
    const freeItemsToAdd: QuoteLineResult[] = [];

    if (promo && promotionRules.length > 0) {
      // Calculate eligible lines total and qty for condition checking
      const eligibleLines = outLines.filter(l => eligibleLineIds.includes(l.line_id));
      const eligibleTotal = eligibleLines.reduce((sum, l) => sum + (l.line_total_after ?? 0), 0);
      const eligibleQty = eligibleLines.reduce((sum, l) => sum + l.qty, 0);
      const totalQty = outLines.reduce((sum, l) => sum + l.qty, 0);

      for (const rule of promotionRules) {
        // Evaluate conditions
        let conditionsPassed = true;
        const conditions = rule.conditions || {};

        if (conditions.min_order_value) {
          const passed = subtotalBefore >= conditions.min_order_value;
          conditionsMet[`min_order_value_${conditions.min_order_value}`] = passed;
          conditionsPassed = conditionsPassed && passed;
        }

        if (conditions.min_qty) {
          const passed = totalQty >= conditions.min_qty;
          conditionsMet[`min_qty_${conditions.min_qty}`] = passed;
          conditionsPassed = conditionsPassed && passed;
        }

        if (conditions.min_eligible_qty) {
          const passed = eligibleQty >= conditions.min_eligible_qty;
          conditionsMet[`min_eligible_qty_${conditions.min_eligible_qty}`] = passed;
          conditionsPassed = conditionsPassed && passed;
        }

        if (!conditionsPassed) {
          continue; // Skip this rule if conditions not met
        }

        // Apply actions
        for (const action of rule.actions) {
          if (action.type === "PERCENT_OFF" && action.apply_to === "ELIGIBLE_LINES") {
            const discountRate = action.percent / 100;
            eligibleLines.forEach(line => {
              const currentPrice = line.unit_price_after ?? 0;
              const discountedPrice = money(currentPrice * (1 - discountRate));
              const discountAmount = (currentPrice - discountedPrice) * line.qty;
              
              line.unit_price_after = discountedPrice;
              line.line_total_after = discountedPrice * line.qty;
              line.adjustments = line.adjustments || [];
              line.adjustments.push({
                type: "PERCENT_OFF",
                amount: discountAmount,
                details: `${action.percent}% off eligible items`
              });
              
              discountTotal += discountAmount;
            });
            
            rulesApplied.push(`PERCENT_OFF_${action.percent}`);
          }

          if (action.type === "AMOUNT_OFF") {
            const totalDiscount = action.amount;
            
            if (action.apply_to === "ORDER_TOTAL") {
              // Distribute discount proportionally across ALL lines
              const allocation = action.allocation || "PROPORTIONAL";
              
              if (allocation === "PROPORTIONAL") {
                outLines.forEach(line => {
                  const lineRatio = (line.line_total_after ?? 0) / subtotalBefore;
                  const lineDiscount = money(totalDiscount * lineRatio);
                  const newTotal = Math.max(0, (line.line_total_after ?? 0) - lineDiscount);
                  const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;
                  
                  line.unit_price_after = newUnitPrice;
                  line.line_total_after = newTotal;
                  line.adjustments = line.adjustments || [];
                  line.adjustments.push({
                    type: "AMOUNT_OFF",
                    amount: lineDiscount,
                    details: `Proportional discount from order total`
                  });
                  
                  discountTotal += lineDiscount;
                });
              }
            } else if (action.apply_to === "ELIGIBLE_LINES") {
              // Distribute discount proportionally across eligible lines only
              const allocation = action.allocation || "PROPORTIONAL";
              
              if (allocation === "PROPORTIONAL" && eligibleTotal > 0) {
                eligibleLines.forEach(line => {
                  const lineRatio = (line.line_total_after ?? 0) / eligibleTotal;
                  const lineDiscount = money(totalDiscount * lineRatio);
                  const newTotal = Math.max(0, (line.line_total_after ?? 0) - lineDiscount);
                  const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;
                  
                  line.unit_price_after = newUnitPrice;
                  line.line_total_after = newTotal;
                  line.adjustments = line.adjustments || [];
                  line.adjustments.push({
                    type: "AMOUNT_OFF",
                    amount: lineDiscount,
                    details: `Proportional discount on eligible items`
                  });
                  
                  discountTotal += lineDiscount;
                });
              }
            }
            
            rulesApplied.push(`AMOUNT_OFF_${action.amount}`);
          }

          if (action.type === "AMOUNT_OFF_PER_ITEM") {
            const discountPerItem = action.amount;
            const maxItems = action.max_items || Infinity;
            let itemsDiscounted = 0;
            
            for (const line of eligibleLines) {
              if (itemsDiscounted >= maxItems) break;
              
              const qtyToDiscount = Math.min(line.qty, maxItems - itemsDiscounted);
              const lineDiscount = discountPerItem * qtyToDiscount;
              const newTotal = Math.max(0, (line.line_total_after ?? 0) - lineDiscount);
              const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;
              
              line.unit_price_after = newUnitPrice;
              line.line_total_after = newTotal;
              line.adjustments = line.adjustments || [];
              line.adjustments.push({
                type: "AMOUNT_OFF_PER_ITEM",
                amount: lineDiscount,
                details: `${money(discountPerItem)} off per item (${qtyToDiscount} items)`
              });
              
              discountTotal += lineDiscount;
              itemsDiscounted += qtyToDiscount;
            }
            
            rulesApplied.push(`AMOUNT_OFF_PER_ITEM_${action.amount}`);
          }

          if (action.type === "FREE_ITEM") {
            const maxPerOrder = action.max_per_order || 1;
            const qtyToAdd = Math.min(action.qty, maxPerOrder);
            
            // Look up the free item variant
            const freeVariant = (variantsResult.data ?? []).find(v => v.id === action.variant_id);
            
            if (freeVariant) {
              const freeProductId = freeVariant.product_id;
              const freePriceKey = freeVariant.size_key;
              const freePrice = priceMap.get(key(freeProductId, freePriceKey)) || 0;
              
              freeItemsToAdd.push({
                line_id: `free-${action.variant_id}-${Date.now()}`,
                product_id: freeProductId,
                qty: qtyToAdd,
                display_price_key: freePriceKey,
                charged_price_key: freePriceKey,
                unit_price_before: freePrice,
                unit_price_after: 0,
                line_total_before: freePrice * qtyToAdd,
                line_total_after: 0,
                is_free_item: true,
                adjustments: [{
                  type: "FREE_ITEM",
                  amount: freePrice * qtyToAdd,
                  details: `Free gift item (${qtyToAdd}x)`
                }],
              });
              
              discountTotal += freePrice * qtyToAdd;
            }
            
            rulesApplied.push(`FREE_ITEM_${action.variant_id}`);
          }
        }
      }
    }

    // Legacy DISCOUNT support (if no rules defined)
    if (promo && promotionRules.length === 0 && legacyDiscountRate > 0) {
      const eligibleLines = outLines.filter(l => eligibleLineIds.includes(l.line_id));
      
      eligibleLines.forEach(line => {
        const currentPrice = line.unit_price_after ?? 0;
        const discountedPrice = money(currentPrice * (1 - legacyDiscountRate));
        const discountAmount = (currentPrice - discountedPrice) * line.qty;
        
        line.unit_price_after = discountedPrice;
        line.line_total_after = discountedPrice * line.qty;
        line.adjustments = line.adjustments || [];
        line.adjustments.push({
          type: "DISCOUNT",
          amount: discountAmount,
          details: "Legacy DISCOUNT promotion"
        });
        
        discountTotal += discountAmount;
      });
    }

    // Debug logging (dev/non-prod only)
    if (isDev && promo) {
      console.log("[PricingEngine] Results:", {
        eligibleLineIds: eligibleLineIds.length,
        totalLines: lines.length,
        subtotalBefore,
        discountTotal,
        grandTotal: subtotalBefore - discountTotal,
        rulesApplied,
        freeItemsCount: freeItemsToAdd.length,
      });
    }

    // Calculate final grand total
    const finalGrandTotal = subtotalBefore - discountTotal;

    return {
      ok: true,
      lines: outLines,
      free_items: freeItemsToAdd.length > 0 ? freeItemsToAdd : undefined,
      totals: {
        subtotal_before: subtotalBefore,
        discount_total: discountTotal,
        grand_total: finalGrandTotal,
      },
      meta: {
        free_upsize_applied: freeUpsize,
        discount_percent:
          promo?.promo_type === "DISCOUNT" && hasIncludeScope
            ? (promo?.percent_off ?? 0)
            : promotionRules.length > 0 ? 0 : 0,
        drink_qty: eligibleDrinkQty,
        rules_applied: rulesApplied.length > 0 ? rulesApplied : undefined,
        conditions_met: Object.keys(conditionsMet).length > 0 ? conditionsMet : undefined,
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
