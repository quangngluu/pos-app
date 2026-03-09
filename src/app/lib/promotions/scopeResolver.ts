/**
 * Scope Resolver
 * 
 * Loads scope targets from DB (unified table only — no legacy fallback)
 * and provides the isLineEligible() function for checking whether a
 * specific line item qualifies for a promotion.
 */

import { ScopeTarget } from "./types";
import { normalizeCategory } from "./normalizeCategory";

/* =========================
   Resolved Scope Sets
========================= */

export type ResolvedScopes = {
    hasIncludeScope: boolean;
    normalizedIncludedCategories: string[];
    normalizedExcludedCategories: string[];
    includedSubcategories: string[];
    excludedSubcategories: string[];
    includeProductIds: string[];
    excludeProductIds: string[];
    includeVariantIds: string[];
    excludeVariantIds: string[];
};

/**
 * Build resolved include/exclude sets from raw scope targets.
 */
export function resolveScopes(scopeTargets: ScopeTarget[]): ResolvedScopes {
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

    const normalizedIncludedCategories = includedCategories
        .map(normalizeCategory)
        .filter(c => c !== "UNKNOWN");

    const normalizedExcludedCategories = excludedCategories
        .map(normalizeCategory)
        .filter(c => c !== "UNKNOWN");

    const hasIncludeScope =
        includedCategories.length > 0 ||
        includedSubcategories.length > 0 ||
        includeProductIds.length > 0 ||
        includeVariantIds.length > 0;

    return {
        hasIncludeScope,
        normalizedIncludedCategories,
        normalizedExcludedCategories,
        includedSubcategories,
        excludedSubcategories,
        includeProductIds,
        excludeProductIds,
        includeVariantIds,
        excludeVariantIds,
    };
}

/**
 * Check if a specific line item is eligible for the promotion
 * based on multi-level scope targeting.
 * 
 * Priority order (most specific wins):
 *   VARIANT > PRODUCT > SUBCATEGORY > CATEGORY
 */
export function isLineEligible(
    scopes: ResolvedScopes,
    productId: string,
    productCategory: string,
    variantId: string | undefined,
    subcategoryId: string | undefined,
): boolean {
    if (!scopes.hasIncludeScope) return false;
    if (productCategory === "UNKNOWN") return false;

    // Check VARIANT-level targeting (most specific)
    if (variantId) {
        if (scopes.includeVariantIds.includes(variantId)) {
            return !scopes.excludeVariantIds.includes(variantId);
        }
        if (scopes.excludeVariantIds.includes(variantId)) {
            return false;
        }
    }

    // Check PRODUCT-level targeting
    if (scopes.includeProductIds.includes(productId)) {
        return !scopes.excludeProductIds.includes(productId);
    }
    if (scopes.excludeProductIds.includes(productId)) {
        return false;
    }

    // Check SUBCATEGORY-level targeting
    if (subcategoryId) {
        if (scopes.includedSubcategories.includes(subcategoryId)) {
            return !scopes.excludedSubcategories.includes(subcategoryId);
        }
        if (scopes.excludedSubcategories.includes(subcategoryId)) {
            return false;
        }
    }

    // Check CATEGORY-level targeting (least specific)
    const isIncluded = scopes.normalizedIncludedCategories.includes(productCategory);
    const isExcluded = scopes.normalizedExcludedCategories.includes(productCategory);
    return isIncluded && !isExcluded;
}
