/**
 * Promotion System — Public API
 * 
 * Re-exports for backward compatibility and clean imports.
 */

// Engine
export { quoteOrder } from "./engine";

// Types
export type {
    Promotion,
    ScopeTarget,
    ScopeTargetType,
    PromotionConditions,
    PromotionAction,
    PromotionRule,
    QuoteLine,
    QuoteLineResult,
    QuoteResult,
    Adjustment,
    EngineContext,
} from "./types";

// Sub-modules (for direct use in admin/tests)
export { normalizeCategory } from "./normalizeCategory";
export { resolveScopes, isLineEligible } from "./scopeResolver";
export type { ResolvedScopes } from "./scopeResolver";
export { evaluateConditions } from "./conditionEvaluator";
export type { ConditionContext, ConditionResult } from "./conditionEvaluator";
export { executeAction } from "./actionExecutor";
export type { ActionContext, ActionResult } from "./actionExecutor";
