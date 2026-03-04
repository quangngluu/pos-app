export type ProductRow = {
    product_id: string;
    product_code: string;
    name: string;
    category: string | null;
    price_phe: number | null;
    price_la: number | null;
    price_std: number | null;
    subcategory_name: string | null;
    has_sugar_options: boolean;
};

export type SizeKey = "SIZE_PHE" | "SIZE_LA" | "STD";

export type SugarOption = {
    product_id: string;
    product_code: string;
    value_code: string;
    label: string;
    is_default: boolean;
    sort_order: number;
};

export type Line = {
    id: string;
    product_id: string;
    product_name_input: string;
    size: SizeKey;
    sugar_value_code: string;
    qty: number;
    note?: string;
};

export type DraftLine = {
    id: string;
    product_id: string;
    qty: number;
    size: SizeKey;
    sugar_value_code: string;
    note: string;
};

export type QuoteLine = {
    line_id: string;
    product_id: string;
    qty: number;
    display_price_key?: SizeKey;
    charged_price_key?: SizeKey;
    unit_price_before?: number;
    unit_price_after?: number;
    line_total_before?: number;
    line_total_after?: number;
    adjustments?: { type: "FREE_UPSIZE" | "DISCOUNT" | string; amount: number }[];
    missing_price?: boolean;
};

export type QuoteResult = {
    ok: boolean;
    lines: QuoteLine[];
    totals: {
        subtotal_before: number;
        discount_total: number;
        grand_total: number;
    };
    meta?: {
        free_upsize_applied?: boolean;
        discount_percent?: number;
        drink_qty?: number;
    };
    error?: string;
};
