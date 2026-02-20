import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ order_code: string }> }) {
    try {
        const { order_code } = await params;

        if (!order_code) {
            return NextResponse.json({ ok: false, error: "Missing order_code" }, { status: 400 });
        }

        // Use admin client since this is a public unauthenticated route 
        // but only fetch specific safe fields
        const { data: order, error } = await supabaseAdmin
            .from("orders")
            .select(`
        id,
        order_code,
        status,
        total,
        created_at,
        address,
        note,
        status_placed_at,
        status_confirmed_at,
        status_shipping_at,
        status_completed_at,
        order_lines (
          id,
          product_name_snapshot,
          qty,
          price_key_snapshot,
          options_snapshot,
          line_total
        )
      `)
            .eq("order_code", order_code)
            .maybeSingle();

        if (error) {
            console.error("GET /api/track/[order_code] error:", error);
            return NextResponse.json({ ok: false, error: "Failed to fetch order" }, { status: 500 });
        }

        if (!order) {
            return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
        }

        return NextResponse.json({
            ok: true,
            order: {
                id: order.id,
                order_code: order.order_code,
                status: order.status,
                total: order.total,
                created_at: order.created_at,
                address: order.address,
                note: order.note,
                timestamps: {
                    placed_at: order.status_placed_at || order.created_at,
                    confirmed_at: order.status_confirmed_at,
                    shipping_at: order.status_shipping_at,
                    completed_at: order.status_completed_at,
                },
                lines: order.order_lines.map((l: any) => ({
                    id: l.id,
                    name: l.product_name_snapshot,
                    qty: l.qty,
                    size: l.price_key_snapshot,
                    options: l.options_snapshot,
                    total: l.line_total
                }))
            }
        });

    } catch (e: any) {
        console.error("GET /api/track/[order_code] unexpected error:", e);
        return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
    }
}
