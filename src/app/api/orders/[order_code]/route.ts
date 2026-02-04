import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/lib/requireAuth";
import {
  ORDER_STATUSES,
  OrderStatus,
  VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";

export async function GET(_req: Request, { params }: { params: Promise<{ order_code: string }> }) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { order_code: orderIdentifier } = await params;
    if (!orderIdentifier) {
      return NextResponse.json({ ok: false, error: "Missing order code" }, { status: 400 });
    }

    // Check if identifier is UUID (order.id) or order_code
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdentifier);
    
    // Fetch order owned by user - by id or order_code
    // Include customer info and images
    let query = supabaseAdmin
      .from("orders")
      .select(`
        id, 
        order_code, 
        status, 
        total, 
        subtotal, 
        discount_total, 
        created_at,
        images,
        customer_id,
        note,
        address,
        customers (
          id,
          customer_name,
          phone_number
        )
      `)
      .eq("created_by", user.id);
    
    if (isUUID) {
      query = query.eq("id", orderIdentifier);
    } else {
      query = query.eq("order_code", orderIdentifier);
    }
    
    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr) {
      console.error("GET /api/orders/[order_code] order error:", orderErr);
      return NextResponse.json({ ok: false, error: "Failed to fetch order" }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    // Fetch order lines (if table exists)
    const { data: lines, error: linesErr } = await supabaseAdmin
      .from("order_lines")
      .select("product_id, product_name_snapshot, price_key_snapshot, unit_price_snapshot, qty, options_snapshot, line_total, note")
      .eq("order_id", order.id);

    if (linesErr) {
      console.error("GET /api/orders/[order_code] lines error:", linesErr);
      return NextResponse.json({ ok: false, error: "Failed to fetch order lines" }, { status: 500 });
    }

    // Extract customer info (handle both object and array from Supabase join)
    const customerData = order.customers as any;
    const customer = customerData && !Array.isArray(customerData) 
      ? customerData 
      : Array.isArray(customerData) && customerData.length > 0 
        ? customerData[0] 
        : null;

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_code: order.order_code,
        status: order.status,
        total: order.total,
        subtotal: order.subtotal,
        discount_total: order.discount_total,
        created_at: order.created_at,
        lines: lines ?? [],
        images: order.images || [],
        note: order.note,
        address: order.address,
        customer: customer ? {
          id: customer.id,
          name: customer.customer_name,
          phone: customer.phone_number,
        } : null,
      },
    });
  } catch (e: any) {
    console.error("GET /api/orders/[order_code] unexpected error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/orders/[order_code] - Update order status
 * 
 * Body: { status: OrderStatus }
 * 
 * Rules:
 * - User must own the order (created_by == user.id)
 * - Status transitions are validated via VALID_TRANSITIONS
 * - Cannot go backwards in status flow (except CANCELLED from any non-terminal state)
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ order_code: string }> }) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { order_code: orderIdentifier } = await params;
    if (!orderIdentifier) {
      return NextResponse.json({ ok: false, error: "Missing order code" }, { status: 400 });
    }

    // Parse request body
    let body: { status?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const newStatus = body.status as OrderStatus;
    if (!newStatus || !ORDER_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status", valid: ORDER_STATUSES },
        { status: 400 }
      );
    }

    // Check if identifier is UUID (order.id) or order_code
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdentifier);

    // Fetch order owned by user - by id or order_code
    let fetchQuery = supabaseAdmin
      .from("orders")
      .select("id, order_code, status")
      .eq("created_by", user.id);
    
    if (isUUID) {
      fetchQuery = fetchQuery.eq("id", orderIdentifier);
    } else {
      fetchQuery = fetchQuery.eq("order_code", orderIdentifier);
    }
    
    const { data: order, error: orderErr } = await fetchQuery.maybeSingle();

    if (orderErr) {
      console.error("PATCH /api/orders/[order_code] fetch error:", orderErr);
      return NextResponse.json({ ok: false, error: "Failed to fetch order" }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    // Validate status transition
    const currentStatus = order.status as OrderStatus;
    const allowedNext = VALID_TRANSITIONS[currentStatus];

    if (!allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid status transition",
          current: currentStatus,
          allowed: allowedNext,
        },
        { status: 400 }
      );
    }

    // Build update payload with timestamp
    // Only include status - timestamp columns may not exist in all deployments
    const updateData: Record<string, any> = { status: newStatus };

    // Update order
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update(updateData)
      .eq("id", order.id);

    if (updateErr) {
      console.error("PATCH /api/orders/[order_code] update error:", updateErr);
      return NextResponse.json({ ok: false, error: "Failed to update order" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_code: order.order_code,
        status: newStatus,
        previous_status: currentStatus,
      },
    });
  } catch (e: any) {
    console.error("PATCH /api/orders/[order_code] unexpected error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
