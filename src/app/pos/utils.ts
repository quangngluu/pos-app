import type { Line, ProductRow } from "./types";

export function newLine(): Line {
    return {
        id: crypto.randomUUID(),
        product_id: "",
        product_name_input: "",
        size: "STD",
        sugar_value_code: "",
        qty: 1,
    };
}

export function formatMoney(n: number) {
    return Math.round(n).toLocaleString();
}

export function isPositiveInt(x: unknown) {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) && n > 0;
}

export function safeNumber(x: unknown) {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : 0;
}

export function toNum(x: any): number | null {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
}

export function money(x: unknown) {
    return Math.round(Math.max(0, safeNumber(x)));
}

export function isSizedProduct(p: ProductRow | null) {
    return !!p && p.price_phe != null && p.price_la != null;
}

/** Normalize Vietnamese text for search (remove diacritics, lowercase) */
export function normalizeVietnamese(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d");
}

export async function safeReadJson(res: Response) {
    const text = await res.text();
    try {
        return { ok: res.ok, status: res.status, json: JSON.parse(text), text };
    } catch {
        return { ok: false, status: res.status, json: null as any, text };
    }
}
