import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

// GET /api/admin/sugar-options?product_id=...
// Returns master sugar options list and (optionally) selected options for a product
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    try {
        // Always return master sugar options
        const { data: options, error: optErr } = await supabaseAdmin
            .from("option_values")
            .select("code, name_default, meta")
            .eq("group_code", "sugar")
            .order("code");

        if (optErr) throw optErr;

        // If product_id provided, also return selected sugar options for that product
        let selected = null;
        if (productId) {
            const { data: productOptions, error: poErr } = await supabaseAdmin
                .from("product_option_values")
                .select("value_code, is_enabled, is_default")
                .eq("product_id", productId)
                .eq("group_code", "sugar")
                .eq("is_enabled", true);

            if (poErr) throw poErr;
            selected = productOptions;
        }

        return NextResponse.json({ ok: true, options: options || [], selected });
    } catch (error: any) {
        console.error("GET /api/admin/sugar-options error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
