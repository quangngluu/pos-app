/**
 * Promotion Engine — Orchestrator
 * 
 * Single source of truth for order pricing + promotion logic.
 * Replaces the monolithic quoteOrder() in pricingEngine.ts.
 * 
 * Flow:
 *   1. Load products, variants, prices, promotion data from DB
 *   2. Resolve scopes → determine line eligibility
 *   3. Price each line (with FREE_UPSIZE handling)
 *   4. Evaluate rule conditions & execute actions
 *   5. Return QuoteResult
 */

import { supabaseAdmin } from "../supabaseAdmin";
import {
    QuoteLine,
    QuoteLineResult,
    QuoteResult,
    PromotionRule,
    PromotionAction,
    ScopeTarget,
} from "./types";
import { normalizeCategory } from "./normalizeCategory";
import { resolveScopes, isLineEligible, ResolvedScopes } from "./scopeResolver";
import { evaluateConditions, ConditionContext } from "./conditionEvaluator";
import { executeAction, ActionContext } from "./actionExecutor";

/* =========================
   Helpers
========================= */

const money = (n: any) => Math.max(0, Math.round(Number(n || 0)));
const priceKey = (pid: string, pk: string) => `${pid}|${pk}`;

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
        const isDev = process.env.NODE_ENV !== "production";

        /* =========================
           1. Load data in parallel
        ========================= */
        const [productsResult, variantsResult, legacyPricesResult, promoResult] = await Promise.all([
            supabaseAdmin
                .from("products")
                .select("*")
                .in("id", productIds)
                .eq("is_active", true),
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
                ok: false, lines: [], meta: {},
                totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
                error: `Products error: ${productsResult.error.message}`,
            };
        }
        if (variantsResult.error) {
            return {
                ok: false, lines: [], meta: {},
                totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
                error: `Variants error: ${variantsResult.error.message}`,
            };
        }
        if (legacyPricesResult.error) {
            return {
                ok: false, lines: [], meta: {},
                totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
                error: `Prices error: ${legacyPricesResult.error.message}`,
            };
        }

        /* =========================
           Build lookup maps
        ========================= */
        const productMap = new Map(
            (productsResult.data ?? []).map(p => [p.id, {
                id: p.id,
                category: (p as any).category_code ?? p.category,
            }])
        );

        const priceMap = new Map<string, number>();

        // Variant pricing (source of truth)
        (variantsResult.data ?? []).forEach(v => {
            const pk = v.size_key;
            const priceRecord = Array.isArray(v.product_variant_prices)
                ? v.product_variant_prices[0]
                : v.product_variant_prices;
            if (priceRecord?.price_vat_incl != null) {
                priceMap.set(priceKey(v.product_id, pk), money(priceRecord.price_vat_incl));
            }
        });

        // Legacy pricing fallback (products without variant pricing)
        const productsWithVariantPricing = new Set(
            (variantsResult.data ?? []).map(v => v.product_id)
        );
        (legacyPricesResult.data ?? []).forEach(p => {
            if (!productsWithVariantPricing.has(p.product_id)) {
                priceMap.set(priceKey(p.product_id, p.price_key), money(p.price_vat_incl));
            }
        });

        // Variant ID lookup: key(product_id, size_key) → variant_id
        const variantMap = new Map<string, string>();
        (variantsResult.data ?? []).forEach(v => {
            variantMap.set(priceKey(v.product_id, v.size_key), v.id);
        });

        // Variant info lookup for FREE_ITEM action: variant_id → { product_id, size_key }
        const variantLookup = new Map<string, { product_id: string; size_key: string }>();
        (variantsResult.data ?? []).forEach(v => {
            variantLookup.set(v.id, { product_id: v.product_id, size_key: v.size_key });
        });

        // Product subcategory lookup
        const productSubcategoryMap = new Map<string, string>();
        (productsResult.data ?? []).forEach(p => {
            if ((p as any).subcategory_id) {
                productSubcategoryMap.set(p.id, (p as any).subcategory_id);
            }
        });

        /* =========================
           2. Load & validate promotion
        ========================= */
        let promo = promoResult.data;

        if (promo) {
            const now = new Date();
            if (promo.valid_from && new Date(promo.valid_from) > now) promo = null;
            if (promo?.valid_until && new Date(promo.valid_until) < now) promo = null;
        }

        let scopeTargets: ScopeTarget[] = [];
        let promotionRules: PromotionRule[] = [];

        if (promo?.code) {
            // Load unified scopes
            const scopesResult = await supabaseAdmin
                .from("promotion_scope_targets")
                .select("target_type, target_id, is_included")
                .eq("promotion_code", promo.code);

            if (scopesResult.data && scopesResult.data.length > 0) {
                scopeTargets = scopesResult.data as ScopeTarget[];
            }

            // Load rules
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
                    conditions: r.conditions as any,
                    actions: (Array.isArray(r.actions) ? r.actions : [r.actions]) as PromotionAction[],
                }));
            }
        }

        /* =========================
           3. Resolve scopes & check eligibility
        ========================= */
        const scopes = resolveScopes(scopeTargets);

        // Legacy discount rate (for promotions without rules)
        const legacyDiscountRate =
            promo?.promo_type === "DISCOUNT" && scopes.hasIncludeScope
                ? Number(promo.percent_off ?? 0) / 100
                : 0;

        // Check if any rule has FREE_UPSIZE action
        const hasFreeUpsizeRule = promotionRules.some(r =>
            r.actions.some(a => a.type === "FREE_UPSIZE")
        );

        // Also support legacy FREE_UPSIZE_5 hardcoded behavior
        const isLegacyFreeUpsize = promo?.code === "FREE_UPSIZE_5" && promo.promo_type === "RULE";

        if (isDev && promo) {
            console.log("[PromotionEngine] Promotion:", {
                code: promo.code,
                type: promo.promo_type,
                scopes: {
                    hasInclude: scopes.hasIncludeScope,
                    categories: scopes.normalizedIncludedCategories,
                },
                rulesCount: promotionRules.length,
                hasFreeUpsizeRule,
                isLegacyFreeUpsize,
            });
        }

        /* =========================
           4. Price each line
        ========================= */
        let subtotalBefore = 0;
        let discountTotal = 0;
        const eligibleLineIds: string[] = [];

        // Count eligible drinks for FREE_UPSIZE
        const eligibleDrinkQty = lines.reduce((s, l) => {
            const product = productMap.get(l.product_id);
            const cat = normalizeCategory(product?.category);
            if (cat !== "DRINK") return s;
            const subcatId = productSubcategoryMap.get(l.product_id);
            const variantId = variantMap.get(priceKey(l.product_id, l.price_key));
            if (scopes.hasIncludeScope) {
                return isLineEligible(scopes, l.product_id, cat, variantId, subcatId) ? s + l.qty : s;
            }
            return s + l.qty;
        }, 0);

        // Determine if FREE_UPSIZE applies
        const freeUpsizeMinQty = (() => {
            // Check rules for FREE_UPSIZE condition
            for (const rule of promotionRules) {
                if (rule.actions.some(a => a.type === "FREE_UPSIZE")) {
                    return rule.conditions?.min_eligible_qty ?? rule.conditions?.min_qty ?? 5;
                }
            }
            // Legacy fallback
            if (isLegacyFreeUpsize) return promo?.min_qty ?? 5;
            return null;
        })();

        const freeUpsize = freeUpsizeMinQty !== null && eligibleDrinkQty >= freeUpsizeMinQty;

        const outLines = lines.map(l => {
            const product = productMap.get(l.product_id);
            const rawCategory = product?.category;
            const productCategory = normalizeCategory(rawCategory);
            const subcategoryId = productSubcategoryMap.get(l.product_id);
            const isDrink = productCategory === "DRINK";
            const variantId = variantMap.get(priceKey(l.product_id, l.price_key));

            // Check eligibility
            const eligibleForPromo = promo
                ? isLineEligible(scopes, l.product_id, productCategory, variantId, subcategoryId)
                : false;
            if (eligibleForPromo) {
                eligibleLineIds.push(l.line_id);
            }

            let displayKey = l.price_key;
            let chargedKey = l.price_key;

            // FREE_UPSIZE: display LA, charge PHE
            const hasBothSizes =
                priceMap.has(priceKey(l.product_id, "SIZE_PHE")) &&
                priceMap.has(priceKey(l.product_id, "SIZE_LA"));

            if (freeUpsize && isDrink && eligibleForPromo && l.price_key === "SIZE_PHE" && hasBothSizes) {
                displayKey = "SIZE_LA";
                chargedKey = "SIZE_PHE";
            }

            const unitBefore = priceMap.get(priceKey(l.product_id, displayKey));
            const unitCharged = priceMap.get(priceKey(l.product_id, chargedKey));

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

            // FREE_UPSIZE adjustment
            if (displayKey !== chargedKey) {
                adjustments.push({
                    type: "FREE_UPSIZE",
                    amount: (unitBefore - unitCharged) * l.qty,
                    details: "Free upsize (SIZE_PHE → SIZE_LA)",
                });
            }

            const result: QuoteLineResult = {
                line_id: l.line_id,
                product_id: l.product_id,
                qty: l.qty,
                display_price_key: displayKey,
                charged_price_key: chargedKey,
                unit_price_before: unitBefore,
                unit_price_after: unitCharged,
                line_total_before: lineBefore,
                line_total_after: lineBefore,
                adjustments,
            };

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
           5. Apply promotion rules
        ========================= */
        const rulesApplied: string[] = [];
        const conditionsMet: Record<string, boolean> = {};
        const freeItemsToAdd: QuoteLineResult[] = [];

        if (promo && promotionRules.length > 0) {
            const eligibleLines = outLines.filter(l => eligibleLineIds.includes(l.line_id));
            const eligibleTotal = eligibleLines.reduce((sum, l) => sum + (l.line_total_after ?? 0), 0);
            const eligibleQty = eligibleLines.reduce((sum, l) => sum + l.qty, 0);
            const totalQty = outLines.reduce((sum, l) => sum + l.qty, 0);

            for (const rule of promotionRules) {
                // Evaluate conditions
                const condCtx: ConditionContext = {
                    subtotalBefore,
                    totalQty,
                    eligibleQty,
                };

                const condResult = evaluateConditions(rule.conditions, condCtx);
                Object.assign(conditionsMet, condResult.details);

                if (!condResult.passed) continue;

                // Execute actions
                for (const action of rule.actions) {
                    // Skip FREE_UPSIZE — already handled in line pricing
                    if (action.type === "FREE_UPSIZE") {
                        rulesApplied.push("FREE_UPSIZE");
                        continue;
                    }

                    const actionCtx: ActionContext = {
                        allLines: outLines,
                        eligibleLines,
                        subtotalBefore,
                        variantLookup,
                        priceMap,
                    };

                    const result = executeAction(action, actionCtx);
                    discountTotal += result.discountTotal;
                    freeItemsToAdd.push(...result.freeItems);
                    rulesApplied.push(result.label);
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
                    details: "Legacy DISCOUNT promotion",
                });

                discountTotal += discountAmount;
            });
        }

        /* =========================
           6. Finalize
        ========================= */
        if (isDev && promo) {
            console.log("[PromotionEngine] Results:", {
                eligibleLineIds: eligibleLineIds.length,
                totalLines: lines.length,
                subtotalBefore,
                discountTotal,
                grandTotal: subtotalBefore - discountTotal,
                rulesApplied,
                freeItemsCount: freeItemsToAdd.length,
            });
        }

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
                    promo?.promo_type === "DISCOUNT" && scopes.hasIncludeScope
                        ? (promo?.percent_off ?? 0)
                        : 0,
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
