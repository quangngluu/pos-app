/**
 * Promotion System Types
 * 
 * Single source of truth for all promotion-related types.
 * Used by: pricingEngine, admin API, admin UI, POS.
 */

/* =========================
   Core Promotion
========================= */

export type Promotion = {
    code: string;
    name: string;
    promo_type: string;
    priority: number;
    is_stackable: boolean;
    is_active: boolean;
    start_at: string | null;
    end_at: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    percent_off: number | null;
    min_qty: number | null;
    scopes?: string[];
    scope_targets?: ScopeTarget[];
    rules?: PromotionRule[];
};

/* =========================
   Scope Targeting
========================= */

export type ScopeTargetType = 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCT' | 'VARIANT';

export type ScopeTarget = {
    target_type: ScopeTargetType;
    target_id: string;
    is_included: boolean;
};

/* =========================
   Conditions
========================= */

export type PromotionConditions = {
    // Original conditions
    min_order_value?: number;
    min_qty?: number;
    min_eligible_qty?: number;
    // Phase 2: Time-based conditions
    time_range?: { start: string; end: string };      // HH:mm format, e.g. "14:00"-"17:00"
    day_of_week?: { days: number[] };                  // 0=Sun, 1=Mon, ..., 6=Sat
    date_range?: { start: string; end: string };       // YYYY-MM-DD format
    // Phase 2: Context-based conditions
    platform?: { platforms: string[] };                // e.g. ["web", "telegram"]
    store_id?: { store_ids: string[] };                // specific store UUIDs
};

/* =========================
   Actions
========================= */

export type PercentOffAction = {
    type: 'PERCENT_OFF';
    percent: number;
    apply_to: 'ELIGIBLE_LINES';
};

export type AmountOffAction = {
    type: 'AMOUNT_OFF';
    amount: number;
    apply_to: 'ORDER_TOTAL' | 'ELIGIBLE_LINES';
    allocation?: 'PROPORTIONAL' | 'EQUAL';
};

export type AmountOffPerItemAction = {
    type: 'AMOUNT_OFF_PER_ITEM';
    amount: number;
    max_items?: number;
};

export type FreeItemAction = {
    type: 'FREE_ITEM';
    variant_id: string;
    qty: number;
    max_per_order?: number;
};

export type FreeUpsizeAction = {
    type: 'FREE_UPSIZE';
    apply_to: 'ELIGIBLE_LINES';
};

// Phase 2: New action types
export type BuyXGetYAction = {
    type: 'BUY_X_GET_Y';
    buy_qty: number;                                   // e.g. 2 (buy 2)
    get_qty: number;                                   // e.g. 1 (get 1)
    get_discount_percent: number;                      // e.g. 100 = free, 50 = half price
};

export type NthItemDiscountAction = {
    type: 'NTH_ITEM_DISCOUNT';
    nth: number;                                       // e.g. 2 (2nd item)
    percent: number;                                   // e.g. 50 (50% off)
};

export type TieredPercentAction = {
    type: 'TIERED_PERCENT';
    tiers: { min_value: number; percent: number }[];   // ordered ascending by min_value
    apply_to: 'ELIGIBLE_LINES' | 'ORDER_TOTAL';
};

export type PromotionAction =
    | PercentOffAction
    | AmountOffAction
    | AmountOffPerItemAction
    | FreeItemAction
    | FreeUpsizeAction
    | BuyXGetYAction
    | NthItemDiscountAction
    | TieredPercentAction;

/* =========================
   Rules
========================= */

export type PromotionRule = {
    id: string;
    promotion_code: string;
    rule_order: number;
    conditions: PromotionConditions | null;
    actions: PromotionAction[];
};

/* =========================
   Engine I/O
========================= */

export type QuoteLine = {
    line_id: string;
    product_id: string;
    qty: number;
    price_key: string;
    options?: Record<string, string>;
};

export type Adjustment = {
    type: string;
    amount: number;
    details?: string;
};

export type QuoteLineResult = {
    line_id: string;
    product_id: string;
    qty: number;
    display_price_key?: string;
    charged_price_key?: string;
    unit_price_before?: number;
    unit_price_after?: number;
    line_total_before?: number;
    line_total_after?: number;
    adjustments?: Adjustment[];
    missing_price?: boolean;
    is_free_item?: boolean;
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
    free_items?: QuoteLineResult[];
    totals: {
        subtotal_before: number;
        discount_total: number;
        grand_total: number;
    };
    meta: {
        free_upsize_applied?: boolean;
        discount_percent?: number;
        drink_qty?: number;
        rules_applied?: string[];
        conditions_met?: Record<string, boolean>;
    };
    error?: string;
};

/* =========================
   Internal Engine Context
========================= */

export type EngineContext = {
    promo: Promotion | null;
    rules: PromotionRule[];
    scopeTargets: ScopeTarget[];
    priceMap: Map<string, number>;
    productMap: Map<string, { id: string; category: string }>;
    variantMap: Map<string, string>;
    productSubcategoryMap: Map<string, string>;
    isDev: boolean;
};
