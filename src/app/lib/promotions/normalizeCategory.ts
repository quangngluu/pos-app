/**
 * Normalize category strings to canonical values for deterministic matching.
 * Maps various category names/codes to standard categories.
 * 
 * Extracted from pricingEngine.ts for shared use.
 */
export function normalizeCategory(cat: string | null | undefined): string {
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
