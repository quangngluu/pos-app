/**
 * Condition Evaluator
 * 
 * Evaluates whether promotion rule conditions are met for a given order context.
 * Uses a registry pattern so new condition types can be added easily.
 */

import { PromotionConditions } from "./types";

/* =========================
   Evaluation Context
========================= */

export type ConditionContext = {
    subtotalBefore: number;
    totalQty: number;
    eligibleQty: number;
    // Phase 2: additional context
    currentTime?: Date;       // defaults to now()
    platform?: string;        // e.g. "web", "telegram"
    storeId?: string;         // current store UUID
};

/* =========================
   Condition Result
========================= */

export type ConditionResult = {
    passed: boolean;
    details: Record<string, boolean>;
};

/* =========================
   Evaluator Registry
========================= */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConditionEvaluatorFn = (value: any, ctx: ConditionContext) => { key: string; passed: boolean };

const conditionEvaluators: Record<string, ConditionEvaluatorFn> = {
    /* ---- Original conditions ---- */

    min_order_value: (value: number, ctx) => ({
        key: `min_order_value_${value}`,
        passed: ctx.subtotalBefore >= value,
    }),

    min_qty: (value: number, ctx) => ({
        key: `min_qty_${value}`,
        passed: ctx.totalQty >= value,
    }),

    min_eligible_qty: (value: number, ctx) => ({
        key: `min_eligible_qty_${value}`,
        passed: ctx.eligibleQty >= value,
    }),

    /* ---- Phase 2: Time-based conditions ---- */

    time_range: (value: { start: string; end: string }, ctx) => {
        const now = ctx.currentTime ?? new Date();
        const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        // Handle overnight ranges like "22:00"-"06:00"
        const inRange = value.start <= value.end
            ? hhmm >= value.start && hhmm <= value.end
            : hhmm >= value.start || hhmm <= value.end;
        return {
            key: `time_range_${value.start}_${value.end}`,
            passed: inRange,
        };
    },

    day_of_week: (value: { days: number[] }, ctx) => {
        const now = ctx.currentTime ?? new Date();
        const today = now.getDay(); // 0=Sun, 6=Sat
        return {
            key: `day_of_week_${value.days.join(",")}`,
            passed: value.days.includes(today),
        };
    },

    date_range: (value: { start: string; end: string }, ctx) => {
        const now = ctx.currentTime ?? new Date();
        const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        return {
            key: `date_range_${value.start}_${value.end}`,
            passed: todayStr >= value.start && todayStr <= value.end,
        };
    },

    /* ---- Phase 2: Context-based conditions ---- */

    platform: (value: { platforms: string[] }, ctx) => {
        const currentPlatform = ctx.platform ?? "web";
        return {
            key: `platform_${value.platforms.join(",")}`,
            passed: value.platforms.includes(currentPlatform),
        };
    },

    store_id: (value: { store_ids: string[] }, ctx) => {
        if (!ctx.storeId) {
            // No store context = condition passes (don't block on missing data)
            return { key: `store_id`, passed: true };
        }
        return {
            key: `store_id_${value.store_ids.length}`,
            passed: value.store_ids.includes(ctx.storeId),
        };
    },
};

/* =========================
   Main Evaluator
========================= */

/**
 * Evaluate all conditions in a rule. Returns whether ALL conditions pass
 * (AND logic) plus per-condition details for debugging.
 */
export function evaluateConditions(
    conditions: PromotionConditions | null,
    ctx: ConditionContext,
): ConditionResult {
    if (!conditions || Object.keys(conditions).length === 0) {
        return { passed: true, details: {} };
    }

    let allPassed = true;
    const details: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(conditions)) {
        if (value == null || value === undefined) continue;

        const evaluator = conditionEvaluators[key];
        if (!evaluator) {
            if (process.env.NODE_ENV !== "production") {
                console.warn(`[ConditionEvaluator] Unknown condition: ${key}`);
            }
            continue;
        }

        const result = evaluator(value, ctx);
        details[result.key] = result.passed;
        if (!result.passed) allPassed = false;
    }

    return { passed: allPassed, details };
}
