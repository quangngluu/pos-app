/**
 * Action Executor
 * 
 * Executes promotion actions (discounts, free items, etc.) against order lines.
 * Uses a registry pattern for extensibility.
 */

import { PromotionAction, QuoteLineResult, Adjustment } from "./types";

/* =========================
   Helpers
========================= */

const money = (n: number) => Math.max(0, Math.round(n));

/* =========================
   Execution Context
========================= */

export type ActionContext = {
    allLines: QuoteLineResult[];
    eligibleLines: QuoteLineResult[];
    subtotalBefore: number;
    /** Map from key(productId, sizeKey) → variant data for FREE_ITEM lookups */
    variantLookup?: Map<string, { product_id: string; size_key: string }>;
    /** Map from key(productId, priceKey) → price */
    priceMap: Map<string, number>;
};

export type ActionResult = {
    discountTotal: number;
    freeItems: QuoteLineResult[];
    label: string;
};

/* =========================
   Action Executors
========================= */

function executePercentOff(
    action: Extract<PromotionAction, { type: 'PERCENT_OFF' }>,
    ctx: ActionContext,
): ActionResult {
    const discountRate = action.percent / 100;
    let discountTotal = 0;

    ctx.eligibleLines.forEach(line => {
        const currentPrice = line.unit_price_after ?? 0;
        const discountedPrice = money(currentPrice * (1 - discountRate));
        const discountAmount = (currentPrice - discountedPrice) * line.qty;

        line.unit_price_after = discountedPrice;
        line.line_total_after = discountedPrice * line.qty;
        line.adjustments = line.adjustments || [];
        line.adjustments.push({
            type: "PERCENT_OFF",
            amount: discountAmount,
            details: `${action.percent}% off eligible items`,
        });

        discountTotal += discountAmount;
    });

    return {
        discountTotal,
        freeItems: [],
        label: `PERCENT_OFF_${action.percent}`,
    };
}

function executeAmountOff(
    action: Extract<PromotionAction, { type: 'AMOUNT_OFF' }>,
    ctx: ActionContext,
): ActionResult {
    const totalDiscount = action.amount;
    let discountTotal = 0;
    const allocation = action.allocation || "PROPORTIONAL";

    const targetLines = action.apply_to === "ORDER_TOTAL" ? ctx.allLines : ctx.eligibleLines;
    const targetTotal = action.apply_to === "ORDER_TOTAL"
        ? ctx.subtotalBefore
        : ctx.eligibleLines.reduce((sum, l) => sum + (l.line_total_after ?? 0), 0);

    if (allocation === "PROPORTIONAL" && targetTotal > 0) {
        targetLines.forEach(line => {
            const lineRatio = (line.line_total_after ?? 0) / targetTotal;
            const lineDiscount = money(totalDiscount * lineRatio);
            const newTotal = Math.max(0, (line.line_total_after ?? 0) - lineDiscount);
            const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;

            line.unit_price_after = newUnitPrice;
            line.line_total_after = newTotal;
            line.adjustments = line.adjustments || [];
            line.adjustments.push({
                type: "AMOUNT_OFF",
                amount: lineDiscount,
                details: action.apply_to === "ORDER_TOTAL"
                    ? `Proportional discount from order total`
                    : `Proportional discount on eligible items`,
            });

            discountTotal += lineDiscount;
        });
    }

    return {
        discountTotal,
        freeItems: [],
        label: `AMOUNT_OFF_${action.amount}`,
    };
}

function executeAmountOffPerItem(
    action: Extract<PromotionAction, { type: 'AMOUNT_OFF_PER_ITEM' }>,
    ctx: ActionContext,
): ActionResult {
    const discountPerItem = action.amount;
    const maxItems = action.max_items || Infinity;
    let itemsDiscounted = 0;
    let discountTotal = 0;

    for (const line of ctx.eligibleLines) {
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
            details: `${money(discountPerItem)} off per item (${qtyToDiscount} items)`,
        });

        discountTotal += lineDiscount;
        itemsDiscounted += qtyToDiscount;
    }

    return {
        discountTotal,
        freeItems: [],
        label: `AMOUNT_OFF_PER_ITEM_${action.amount}`,
    };
}

function executeFreeItem(
    action: Extract<PromotionAction, { type: 'FREE_ITEM' }>,
    ctx: ActionContext,
): ActionResult {
    const maxPerOrder = action.max_per_order || 1;
    const qtyToAdd = Math.min(action.qty, maxPerOrder);
    let discountTotal = 0;
    const freeItems: QuoteLineResult[] = [];

    // Look up the variant in the price map
    if (ctx.variantLookup) {
        const variant = ctx.variantLookup.get(action.variant_id);
        if (variant) {
            const priceKey = `${variant.product_id}|${variant.size_key}`;
            const freePrice = ctx.priceMap.get(priceKey) || 0;

            freeItems.push({
                line_id: `free-${action.variant_id}-${Date.now()}`,
                product_id: variant.product_id,
                qty: qtyToAdd,
                display_price_key: variant.size_key,
                charged_price_key: variant.size_key,
                unit_price_before: freePrice,
                unit_price_after: 0,
                line_total_before: freePrice * qtyToAdd,
                line_total_after: 0,
                is_free_item: true,
                adjustments: [{
                    type: "FREE_ITEM",
                    amount: freePrice * qtyToAdd,
                    details: `Free gift item (${qtyToAdd}x)`,
                }],
            });

            discountTotal += freePrice * qtyToAdd;
        }
    }

    return {
        discountTotal,
        freeItems,
        label: `FREE_ITEM_${action.variant_id}`,
    };
}

function executeFreeUpsize(
    action: Extract<PromotionAction, { type: 'FREE_UPSIZE' }>,
    ctx: ActionContext,
): ActionResult {
    // FREE_UPSIZE is handled during line pricing (display vs charged key).
    // This action type is a marker — the actual logic is in the engine's
    // line pricing phase where it swaps display_price_key to SIZE_LA
    // while keeping charged_price_key as SIZE_PHE.
    // No additional discount to apply here.
    return {
        discountTotal: 0,
        freeItems: [],
        label: "FREE_UPSIZE",
    };
}

/* =========================
   Phase 2: New Action Executors
========================= */

/**
 * BUY_X_GET_Y: Buy `buy_qty` items, get `get_qty` items at `get_discount_percent`% off.
 * E.g. buy_qty=2, get_qty=1, get_discount_percent=100 → Buy 2 Get 1 Free
 * 
 * Logic: sort eligible lines by price desc, group into sets of (buy+get),
 * discount the cheapest `get_qty` items in each set.
 */
function executeBuyXGetY(
    action: Extract<PromotionAction, { type: 'BUY_X_GET_Y' }>,
    ctx: ActionContext,
): ActionResult {
    const { buy_qty, get_qty, get_discount_percent } = action;
    const discountRate = get_discount_percent / 100;
    const setSize = buy_qty + get_qty;
    let discountTotal = 0;

    // Expand eligible lines into individual items sorted by price (desc)
    const items: { lineIdx: number; unitPrice: number }[] = [];
    ctx.eligibleLines.forEach((line, idx) => {
        for (let i = 0; i < line.qty; i++) {
            items.push({ lineIdx: idx, unitPrice: line.unit_price_after ?? 0 });
        }
    });
    items.sort((a, b) => b.unitPrice - a.unitPrice);

    // Group into sets; discount the last `get_qty` in each set
    const lineDiscounts = new Map<number, number>();
    for (let i = 0; i < items.length; i++) {
        const posInSet = i % setSize;
        if (posInSet >= buy_qty) {
            // This is a "get" item → apply discount
            const item = items[i];
            const discount = money(item.unitPrice * discountRate);
            lineDiscounts.set(item.lineIdx, (lineDiscounts.get(item.lineIdx) ?? 0) + discount);
            discountTotal += discount;
        }
    }

    // Apply accumulated discounts to lines
    lineDiscounts.forEach((totalLineDiscount, lineIdx) => {
        const line = ctx.eligibleLines[lineIdx];
        const newTotal = Math.max(0, (line.line_total_after ?? 0) - totalLineDiscount);
        const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;
        line.unit_price_after = newUnitPrice;
        line.line_total_after = newTotal;
        line.adjustments = line.adjustments || [];
        line.adjustments.push({
            type: "BUY_X_GET_Y",
            amount: totalLineDiscount,
            details: `Buy ${buy_qty} Get ${get_qty} at ${get_discount_percent}% off`,
        });
    });

    return {
        discountTotal,
        freeItems: [],
        label: `BUY_${buy_qty}_GET_${get_qty}_${get_discount_percent}PCT`,
    };
}

/**
 * NTH_ITEM_DISCOUNT: Every Nth item gets `percent`% off.
 * E.g. nth=2, percent=50 → every 2nd item is 50% off.
 */
function executeNthItemDiscount(
    action: Extract<PromotionAction, { type: 'NTH_ITEM_DISCOUNT' }>,
    ctx: ActionContext,
): ActionResult {
    const { nth, percent } = action;
    const discountRate = percent / 100;
    let discountTotal = 0;
    let itemCount = 0;

    // Sort eligible lines by price desc (discount cheapest Nth items)
    const sortedLines = [...ctx.eligibleLines].sort(
        (a, b) => (b.unit_price_after ?? 0) - (a.unit_price_after ?? 0)
    );

    for (const line of sortedLines) {
        let lineDiscount = 0;
        for (let i = 0; i < line.qty; i++) {
            itemCount++;
            if (itemCount % nth === 0) {
                const unitDiscount = money((line.unit_price_after ?? 0) * discountRate);
                lineDiscount += unitDiscount;
            }
        }

        if (lineDiscount > 0) {
            const newTotal = Math.max(0, (line.line_total_after ?? 0) - lineDiscount);
            const newUnitPrice = line.qty > 0 ? money(newTotal / line.qty) : 0;
            line.unit_price_after = newUnitPrice;
            line.line_total_after = newTotal;
            line.adjustments = line.adjustments || [];
            line.adjustments.push({
                type: "NTH_ITEM_DISCOUNT",
                amount: lineDiscount,
                details: `Every ${nth}${nth === 2 ? 'nd' : nth === 3 ? 'rd' : 'th'} item ${percent}% off`,
            });
            discountTotal += lineDiscount;
        }
    }

    return {
        discountTotal,
        freeItems: [],
        label: `NTH_${nth}_ITEM_${percent}PCT`,
    };
}

/**
 * TIERED_PERCENT: Apply the highest qualifying tier based on order/eligible total.
 * E.g. tiers: [{min_value: 100000, percent: 5}, {min_value: 200000, percent: 10}]
 */
function executeTieredPercent(
    action: Extract<PromotionAction, { type: 'TIERED_PERCENT' }>,
    ctx: ActionContext,
): ActionResult {
    const targetLines = action.apply_to === "ORDER_TOTAL" ? ctx.allLines : ctx.eligibleLines;
    const targetTotal = action.apply_to === "ORDER_TOTAL"
        ? ctx.subtotalBefore
        : ctx.eligibleLines.reduce((sum, l) => sum + (l.line_total_after ?? 0), 0);

    // Find highest qualifying tier
    const sortedTiers = [...action.tiers].sort((a, b) => b.min_value - a.min_value);
    const qualifyingTier = sortedTiers.find(t => targetTotal >= t.min_value);

    if (!qualifyingTier) {
        return { discountTotal: 0, freeItems: [], label: "TIERED_PERCENT_NO_MATCH" };
    }

    const discountRate = qualifyingTier.percent / 100;
    let discountTotal = 0;

    targetLines.forEach(line => {
        const currentPrice = line.unit_price_after ?? 0;
        const discountedPrice = money(currentPrice * (1 - discountRate));
        const discountAmount = (currentPrice - discountedPrice) * line.qty;

        line.unit_price_after = discountedPrice;
        line.line_total_after = discountedPrice * line.qty;
        line.adjustments = line.adjustments || [];
        line.adjustments.push({
            type: "TIERED_PERCENT",
            amount: discountAmount,
            details: `${qualifyingTier.percent}% off (tier: ≥${qualifyingTier.min_value.toLocaleString()})`,
        });

        discountTotal += discountAmount;
    });

    return {
        discountTotal,
        freeItems: [],
        label: `TIERED_PERCENT_${qualifyingTier.percent}`,
    };
}

/* =========================
   Registry & Dispatcher
========================= */

/**
 * Execute a single promotion action against order lines.
 */
export function executeAction(
    action: PromotionAction,
    ctx: ActionContext,
): ActionResult {
    switch (action.type) {
        case "PERCENT_OFF":
            return executePercentOff(action, ctx);
        case "AMOUNT_OFF":
            return executeAmountOff(action, ctx);
        case "AMOUNT_OFF_PER_ITEM":
            return executeAmountOffPerItem(action, ctx);
        case "FREE_ITEM":
            return executeFreeItem(action, ctx);
        case "FREE_UPSIZE":
            return executeFreeUpsize(action, ctx);
        case "BUY_X_GET_Y":
            return executeBuyXGetY(action, ctx);
        case "NTH_ITEM_DISCOUNT":
            return executeNthItemDiscount(action, ctx);
        case "TIERED_PERCENT":
            return executeTieredPercent(action, ctx);
        default: {
            if (process.env.NODE_ENV !== "production") {
                console.warn(`[ActionExecutor] Unknown action type: ${(action as any).type}`);
            }
            return { discountTotal: 0, freeItems: [], label: `UNKNOWN_${(action as any).type}` };
        }
    }
}
