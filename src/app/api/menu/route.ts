import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/menu — Lightweight product catalog for LLM context
 * Returns minimal product info: id, code, name, available sizes, sugar options
 */
export async function GET() {
    try {
        const [productsResult, sugarResult] = await Promise.all([
            supabaseAdmin
                .from("v_products_menu")
                .select("product_id, product_code, name, category, price_phe, price_la, price_std")
                .order("name"),
            supabaseAdmin
                .from("v_product_sugar_options")
                .select("product_id"),
        ]);

        if (productsResult.error) throw productsResult.error;

        const sugarSet = new Set<string>();
        if (!sugarResult.error && sugarResult.data) {
            sugarResult.data.forEach((r: any) => sugarSet.add(r.product_id));
        }

        const menu = (productsResult.data || [])
            .filter((p: any) => p.price_phe != null || p.price_la != null || p.price_std != null)
            .map((p: any) => {
                const sizes: string[] = [];
                if (p.price_phe != null) sizes.push("SIZE_PHE");
                if (p.price_la != null) sizes.push("SIZE_LA");
                if (p.price_std != null || sizes.length === 0) sizes.push("STD");

                return {
                    id: p.product_id,
                    code: p.product_code,
                    name: p.name,
                    category: p.category,
                    sizes,
                    has_sugar: sugarSet.has(p.product_id),
                };
            });

        return NextResponse.json(
            { ok: true, menu },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                },
            }
        );
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
