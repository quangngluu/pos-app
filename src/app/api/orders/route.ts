import { NextResponse } from "next/server";
import { z } from "zod";
import { ORDER_STATUSES } from "@/app/lib/constants/orderStatus";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { quoteOrder } from "@/app/lib/pricingEngine";
import { requireUser } from "@/app/lib/requireAuth";

// Force dynamic rendering - user-specific data must not be cached
export const dynamic = "force-dynamic";

const SizeKeySchema = z.enum(["SIZE_PHE", "SIZE_LA", "STD"]);

// CRITICAL: Lines MUST include line_id, display_size (UI shows), price_key (for pricing)
// Why display_size vs price_key: FREE_UPSIZE shows LA but charges PHE
const LineSchema = z.object({
  line_id: z.string().uuid(),
  product_id: z.string().min(1),
  qty: z.number().int().positive(),
  display_size: SizeKeySchema, // What UI shows (LA for free upsize)
  price_key: SizeKeySchema, // For pricing calc (PHE for free upsize)
  sugar_value_code: z.string().optional().default(""),
  product_name_snapshot: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const BodySchema = z.object({
  phone: z.string().min(1, "Phone number is required"), // Required for customer
  customer_name: z.string().optional().default(""),
  default_address: z.string().optional().default(""),
  addr_selected: z.any().optional().nullable(), // { place_id, display_name, full_address, lat, lng }
  note: z.string().optional().default(""),
  delivery_time: z.string().optional().default(""),
  platform: z.string().optional().default(""),
  store_id: z.string().uuid().optional().nullable(),
  store_name: z.string().optional().default(""),
  promotion_code: z.string().optional().nullable().default(null),
  images: z.array(z.object({
    file_id: z.string().optional(),
    file_url: z.string().optional(),
    uploaded_at: z.string().optional(),
    source: z.string().optional(),
  })).optional().default([]),
  shipping: z
    .object({
      fee: z.number().nonnegative(),
      discount: z.number().nonnegative().optional().default(0),
      free: z.boolean().optional().default(false),
    })
    .optional()
    .default({ fee: 0, discount: 0, free: false }),
  lines: z.array(LineSchema).min(1),
});

function digitsOnlyPhone(phone: string) {
  return (phone || "").replace(/\D/g, "");
}

function getString(x: any): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function getNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

// Safe coordinate parser (handles strings with comma/dot)
function parseCoord(x: any): number | null {
  if (typeof x === "number") {
    return Number.isFinite(x) ? x : null;
  }
  if (typeof x === "string") {
    const trimmed = x.trim().replace(",", ".");
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Parse address from new Place Details format
function parseAddressFromSelected(addrSelected: any, defaultAddress?: string) {
  if (!addrSelected) return null;

  // Extract fields from new API: { place_id, display_name, full_address, lat, lng, lon, address: {...} }
  const placeId = getString(addrSelected.place_id) ?? null;
  const fullAddress = getString(addrSelected.full_address) ?? getString(addrSelected.display_name) ?? null;
  
  // Accept both lng and lon (lon is alias for backward compatibility)
  const lat = parseCoord(addrSelected.lat) ?? null;
  const lng = parseCoord(addrSelected.lng) ?? parseCoord(addrSelected.lon) ?? null;

  // Extract address components if available
  const addressComponents = addrSelected.address || {};
  const line1 = getString(addressComponents.line1) ?? null;
  const ward = getString(addressComponents.ward) ?? null;
  const district = getString(addressComponents.district) ?? null;
  const city = getString(addressComponents.city) ?? null;
  const state = getString(addressComponents.state) ?? null;
  const postcode = getString(addressComponents.postcode) ?? null;
  const country = getString(addressComponents.country) ?? null;
  const countryCode = getString(addressComponents.country_code) ?? null;

  return {
    placeId,
    fullAddress: fullAddress || defaultAddress || null,
    lat,
    lng,
    line1,
    ward,
    district,
    city,
    state,
    postcode,
    country,
    countryCode,
  };
}

export async function POST(req: Request) {
  try {
    // STEP 1: Require authenticated user
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload", detail: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;

    // SERVER RECOMPUTES ALL PRICING (don't trust client)
    const quoteLines = body.lines.map(l => ({
      line_id: l.line_id,
      product_id: l.product_id,
      qty: l.qty,
      price_key: l.price_key,
      options: { sugar: l.sugar_value_code },
    }));

    const quote = await quoteOrder({
      promotion_code: body.promotion_code,
      lines: quoteLines,
    });

    if (!quote.ok) {
      return NextResponse.json({ ok: false, error: "Quote failed", detail: quote.error }, { status: 400 });
    }

    const hasMissingPrice = quote.lines.some(l => l.missing_price);
    if (hasMissingPrice) {
      return NextResponse.json({ ok: false, error: "Some products have missing prices" }, { status: 400 });
    }

    // Compute shipping
    const shippingFee = Math.max(0, Math.round(body.shipping.fee));
    const shippingDiscount = Math.max(0, Math.round(body.shipping.discount ?? 0));
    const shippingPay = body.shipping.free ? 0 : Math.max(0, shippingFee - shippingDiscount);
    const itemsTotal = quote.totals.grand_total;
    const grandTotal = itemsTotal + shippingPay;

    const phoneNumber = digitsOnlyPhone(body.phone);
    const customerName = (body.customer_name || "").trim();
    const defaultAddress = (body.default_address || "").trim();
    const addrParsed = parseAddressFromSelected(body.addr_selected, defaultAddress);
    const platform = (body.platform || "").trim() || null;
    const deliveryTime = (body.delivery_time || "").trim();

    // DEV logging
    if (process.env.NODE_ENV !== "production") {
      console.log("addrParsed:", JSON.stringify(addrParsed, null, 2));
    }

    // Lookup store if provided
    let storeData: { id: string; name: string } | null = null;
    if (body.store_id) {
      const { data: store, error: storeErr } = await supabaseAdmin
        .from("stores")
        .select("id, name")
        .eq("id", body.store_id)
        .maybeSingle();

      if (storeErr) {
        return NextResponse.json({ ok: false, error: "Failed to lookup store", detail: storeErr }, { status: 500 });
      }
      if (!store) {
        return NextResponse.json({ ok: false, error: "STORE_NOT_FOUND" }, { status: 400 });
      }
      storeData = store;
    }

    // 1) upsert customer by phone
    let customerId: string | null = null;

    if (phoneNumber.length >= 9) {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone_number", phoneNumber)
        .maybeSingle();

      if (findErr) return NextResponse.json({ ok: false, error: "Failed to lookup customer", detail: findErr }, { status: 500 });

      if (existing?.id) {
        customerId = existing.id;

        const updatePayload: any = {
          customer_name: customerName || null,
          default_address: defaultAddress || addrParsed?.fullAddress || null,
          updated_at: new Date().toISOString(),
        };

        if (addrParsed) {
          updatePayload.addr_lat = addrParsed.lat;
          updatePayload.addr_lng = addrParsed.lng;
          updatePayload.addr_place_id = addrParsed.placeId;
          updatePayload.addr_display_name = addrParsed.fullAddress;
        }

        const { error: upErr } = await supabaseAdmin.from("customers").update(updatePayload).eq("id", customerId);
        if (upErr) return NextResponse.json({ ok: false, error: "Failed to update customer", detail: upErr }, { status: 500 });
      } else {
        const insertPayload: any = {
          phone_number: phoneNumber,
          customer_name: customerName || null,
          default_address: defaultAddress || addrParsed?.fullAddress || null,
        };

        if (addrParsed) {
          insertPayload.addr_lat = addrParsed.lat;
          insertPayload.addr_lng = addrParsed.lng;
          insertPayload.addr_place_id = addrParsed.placeId;
          insertPayload.addr_display_name = addrParsed.fullAddress;
        }

        const { data: ins, error: insErr } = await supabaseAdmin
          .from("customers")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insErr) return NextResponse.json({ ok: false, error: "Failed to create customer", detail: insErr }, { status: 500 });

        customerId = ins.id;
      }
    }

    // 2) create order with server-computed pricing
    // Build clean note (user note + optional delivery time)
    const noteParts = [];
    if (body.note) noteParts.push(body.note);
    if (deliveryTime) noteParts.push(`Delivery time: ${deliveryTime}`);
    const cleanNote = noteParts.join(" | ") || null;

    const fullAddress = addrParsed?.fullAddress || defaultAddress || null;

    const orderPayload: any = {
      customer_id: customerId,
      campaign: body.promotion_code || null,
      subtotal: quote.totals.subtotal_before,
      discount_total: quote.totals.discount_total,
      tax_total: 0,
      total: grandTotal,
      note: cleanNote,
      address: fullAddress,
      delivery_display_name: fullAddress,
      platform: platform,
      store_id: storeData?.id || null,
      store_name_snapshot: storeData?.name || null,
      shipping_fee: shippingFee,
      shipping_discount: Math.min(shippingDiscount, shippingFee),
      shipping_is_free: body.shipping.free,
      created_by: user.id, // Track which user created the order
      images: body.images || [], // Store images array
    };

    // Add delivery coordinates if available (only if columns exist)
    if (addrParsed) {
      orderPayload.delivery_lat = addrParsed.lat;
      orderPayload.delivery_lng = addrParsed.lng;
      orderPayload.delivery_place_id = addrParsed.placeId;
      // Note: delivery_addr_line1, delivery_ward, delivery_district, delivery_city, 
      // delivery_state, delivery_postcode, delivery_country columns don't exist yet
    }

    const { data: order, error: orderErr } = await supabaseAdmin.from("orders").insert(orderPayload).select("*").single();
    if (orderErr) {
      console.error("Order insert error:", orderErr);
      return NextResponse.json({ ok: false, error: "Failed to create order", detail: orderErr.message || orderErr }, { status: 500 });
    }

    // 3) create order_lines from quote + display_size
    const orderId = order.id as string;

    const quoteLineMap = new Map(quote.lines.map(ql => [ql.line_id, ql]));
    const linesToInsert = body.lines.map((l) => {
      const ql = quoteLineMap.get(l.line_id);
      const options_snapshot: any = {};
      if (l.sugar_value_code) options_snapshot.sugar_value_code = l.sugar_value_code;

      return {
        order_id: orderId,
        product_id: l.product_id,
        product_name_snapshot: l.product_name_snapshot || "",
        price_key_snapshot: l.display_size, // Store display size (LA for free upsize)
        unit_price_snapshot: ql?.unit_price_after ?? 0, // Server-computed price
        qty: l.qty,
        options_snapshot,
        line_total: ql?.line_total_after ?? 0, // Server-computed total
        note: l.note || null,
      };
    });

    const { error: linesErr } = await supabaseAdmin.from("order_lines").insert(linesToInsert);
    if (linesErr) return NextResponse.json({ ok: false, error: "Failed to create order lines", detail: linesErr }, { status: 500 });

    // 4) optional promotions
    if (body.promotion_code) {
      const { error: promoErr } = await supabaseAdmin.from("order_applied_promotions").insert({
        order_id: orderId,
        promotion_code: body.promotion_code,
        discount_amount: quote.totals.discount_total,
        meta: {},
      });
      if (promoErr) console.warn("order_applied_promotions insert error:", promoErr);
    }

    return NextResponse.json(
      {
        ok: true,
        order: {
          id: orderId,
          order_code: order.order_code ?? null,
          customer_id: customerId,
          created_at: order.created_at ?? null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("POST /api/orders error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/orders - List orders for authenticated user
 * 
 * Query params:
 *   - status: Filter by exact status (optional)
 *   - limit: Max results (default 20, max 100)
 * 
 * Returns only orders where created_by == user.id
 */
export async function GET(req: Request) {
  try {
    // Require authenticated user
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(req.url);
    
    // Parse query params
    const statusFilter = searchParams.get("status");
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(1, limitParam || 20), 100); // Clamp to 1-100

    // Validate status if provided
    if (statusFilter && !ORDER_STATUSES.includes(statusFilter as any)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status value" },
        { status: 400 }
      );
    }

    // Build query - only return orders created by this user
    // Include customer info and images
    let query = supabaseAdmin
      .from("orders")
      .select(`
        id, 
        order_code, 
        status, 
        total, 
        created_at,
        images,
        customer_id,
        customers (
          id,
          customer_name,
          phone_number
        )
      `)
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("GET /api/orders error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    // Transform orders to include flattened customer info
    const transformedOrders = (orders || []).map((o: any) => {
      const customer = o.customers && !Array.isArray(o.customers) 
        ? o.customers 
        : Array.isArray(o.customers) && o.customers.length > 0 
          ? o.customers[0] 
          : null;
      
      return {
        id: o.id,
        order_code: o.order_code,
        status: o.status,
        total: o.total,
        created_at: o.created_at,
        images: o.images || [],
        customer: customer ? {
          id: customer.id,
          name: customer.customer_name,
          phone: customer.phone_number,
        } : null,
      };
    });

    return NextResponse.json({
      ok: true,
      orders: transformedOrders,
      meta: {
        count: transformedOrders.length,
        limit,
      },
    });
  } catch (e: any) {
    console.error("GET /api/orders unexpected error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
