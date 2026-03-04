import { colors, spacing, typography, borderRadius, shadows } from "@/app/lib/designTokens";

/* ============================================================
   Shared Types
============================================================ */

export type Store = {
    id: string;
    name: string;
    address_full: string | null;
    lat: number | null;
    lng: number | null;
    is_active: boolean;
    updated_at: string;
    created_at: string;
    addr_line1?: string | null;
    addr_ward?: string | null;
    addr_district?: string | null;
    addr_city?: string | null;
    addr_state?: string | null;
    addr_postcode?: string | null;
    addr_country?: string | null;
    addr_place_id?: string | null;
    addr_display_name?: string | null;
};

export type Promotion = {
    code: string;
    name: string;
    promo_type: string;
    priority: number;
    is_stackable: boolean;
    is_active: boolean;
    start_at: string | null;
    end_at: string | null;
    percent_off: number | null;
    min_qty: number | null;
    scopes?: string[];
};

export type Product = {
    id: string;
    code: string;
    name: string;
    category: string | null;
    is_active: boolean;
    has_sugar_options?: boolean;
    created_at: string;
    prices: {
        STD?: number;
        SIZE_PHE?: number;
        SIZE_LA?: number;
    };
};

export type Category = {
    code: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

export type Subcategory = {
    id: string;
    category_code: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    categories?: { code: string; name: string };
};

export type Tab = "stores" | "promotions" | "products" | "categories" | "subcategories";

/* ============================================================
   Shared Styles
============================================================ */

export const sharedStyles = {
    input: {
        width: "100%",
        padding: `${spacing['10']} ${spacing['12']}`,
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.primary,
        fontSize: typography.fontSize.base,
    },
    disabledInput: {
        width: "100%",
        padding: `${spacing['10']} ${spacing['12']}`,
        background: colors.bg.tertiary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.tertiary,
        fontSize: typography.fontSize.base,
        cursor: "not-allowed",
    },
    primaryButton: {
        padding: `${spacing['10']} ${spacing['16']}`,
        background: colors.interactive.primary,
        border: `1px solid ${colors.interactive.primary}`,
        borderRadius: borderRadius.md,
        color: colors.text.inverse,
        cursor: "pointer",
        fontWeight: typography.fontWeight.semibold,
    },
    secondaryButton: {
        padding: `${spacing['10']} ${spacing['16']}`,
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.primary,
        cursor: "pointer",
        fontWeight: typography.fontWeight.medium,
    },
    tableHeader: {
        padding: spacing['12'],
        textAlign: "left" as const,
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
        fontSize: typography.fontSize.sm,
        borderBottom: `1px solid ${colors.border.light}`,
        background: colors.bg.secondary,
    },
    tableRow: {
        borderBottom: `1px solid ${colors.border.light}`,
    },
    modalCard: {
        background: colors.bg.primary,
        padding: spacing['24'],
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.lg,
        maxHeight: "90vh",
        overflowY: "auto" as const,
    },
    label: {
        display: "block",
        marginBottom: 4,
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
    labelSemibold: {
        display: "block",
        marginBottom: 8,
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
    },
};
