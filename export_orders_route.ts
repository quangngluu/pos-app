import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const SizeKeySchema = z.enum(["SIZE_PHE", "SIZE_LA", "STD"]);

const LineSchema = z.object({
  product_id: z.string().min(1),
  qty: z.number().int().positive(),
  size: SizeKeySchema,
  sugar_value_code: z.string().optional().default(""),
  product_name_snapshot: z.string().optional().default(""),
  unit_price_snapshot: z.number().nonnegative().optional().default(0),
  line_total: z.number().nonnegative().optional().default(0),
  note: z.string().optional().default(""),
});

const BodySchema = z.object({
  phone: z.string().optional().default(""),
  customer_name: z.string().optional().default(""),
  default_address: z.string().optional().default(""),
  addr_selected: z.any().optional().nullable(),
  note: z.string().optional().default(""),
  promotion_code: z.string().optional().nullable().default(null),
  pricing: z
    .object({
      items_subtotal_before: z.number().nonnegative().optional().default(0),
      items_discount: z.number().nonnegative().optional().default(0),
      tax_total: z.number().nonnegative().optional().default(0),
      grand_total: z.number().nonnegative().optional().default(0),
    })
    .optional()
    .default({ items_subtotal_before: 0, items_discount: 0, tax_total: 0, grand_total: 0 }),
  lines: z.array(LineSchema).min(1),
});

function digitsOnlyPhone(phone: string) {
  return (phone || "").replace(/\D/g, "");
}
function safeNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseAddressFromSelected(addrSelected: any) {
  if (!addrSelected) return null;

  const placeId = addrSelected.place_id ?? addrSelected.raw?.osm_id ?? null;
  const displayName = addrSelected.display_name ?? null;

  const lat = safeNum(addrSelected.lat) ?? safeNum(addrSelected.raw?.lat) ?? null;
  const lng = safeNum(addrSelected.lon) ?? safeNum(addrSelected.raw?.lon) ?? null;

  const a = addrSelected.address ?? {};
  const street = a.street ?? null;
  const housenumber = a.housenumber ?? null;

  const district = a.district ?? null;
  const city = a.city ?? null;
  const state = a.state ?? null;
  const postcode = a.postcode ?? null;
  const country = a.country ?? null;

  const line1 = [housenumber, street].filter(Boolean).join(" ").trim() || null;

  return {
    line1,
    ward: null as string | null,
    district,
    city,
    state,
    postcode,
    country,
    lat,
    lng,
    placeId: placeId != null ? String(placeId) : null,
    displayName,
    raw: addrSelected.raw ?? addrSelected ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload", detail: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;

    const phoneNumber = digitsOnlyPhone(body.phone);
    const customerName = (body.customer_name || "").trim();
    const defaultAddress = (body.default_address || "").trim();
    const addrParsed = parseAddressFromSelected(body.addr_selected);

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
          default_address: defaultAddress || addrParsed?.displayName || null,
          updated_at: new Date().toISOString(),
        };

        if (addrParsed) {
          updatePayload.addr_line1 = addrParsed.line1;
          updatePayload.addr_ward = addrParsed.ward;
          updatePayload.addr_district = addrParsed.district;
          updatePayload.addr_city = addrParsed.city;
          updatePayload.addr_state = addrParsed.state;
          updatePayload.addr_postcode = addrParsed.postcode;
          updatePayload.addr_country = addrParsed.country;
          updatePayload.addr_lat = addrParsed.lat;
          updatePayload.addr_lng = addrParsed.lng;
          updatePayload.addr_place_id = addrParsed.placeId;
          updatePayload.addr_display_name = addrParsed.displayName;
          updatePayload.addr_raw = addrParsed.raw;
        }

        const { error: upErr } = await supabaseAdmin.from("customers").update(updatePayload).eq("id", customerId);
        if (upErr) return NextResponse.json({ ok: false, error: "Failed to update customer", detail: upErr }, { status: 500 });
      } else {
        const insertPayload: any = {
          phone_number: phoneNumber,
          customer_name: customerName || null,
          default_address: defaultAddress || addrParsed?.displayName || null,
        };

        if (addrParsed) {
          insertPayload.addr_line1 = addrParsed.line1;
          insertPayload.addr_ward = addrParsed.ward;
          insertPayload.addr_district = addrParsed.district;
          insertPayload.addr_city = addrParsed.city;
          insertPayload.addr_state = addrParsed.state;
          insertPayload.addr_postcode = addrParsed.postcode;
          insertPayload.addr_country = addrParsed.country;
          insertPayload.addr_lat = addrParsed.lat;
          insertPayload.addr_lng = addrParsed.lng;
          insertPayload.addr_place_id = addrParsed.placeId;
          insertPayload.addr_display_name = addrParsed.displayName;
          insertPayload.addr_raw = addrParsed.raw;
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

    // 2) create order
    const orderPayload: any = {
      customer_id: customerId,
      campaign: body.promotion_code || null,
      subtotal: body.pricing.items_subtotal_before ?? 0,
      discount_total: body.pricing.items_discount ?? 0,
      tax_total: body.pricing.tax_total ?? 0,
      total: body.pricing.grand_total ?? 0,
      note: body.note || null,
      address: defaultAddress || addrParsed?.displayName || null,
    };

    if (addrParsed) {
      orderPayload.delivery_addr_line1 = addrParsed.line1;
      orderPayload.delivery_addr_ward = addrParsed.ward;
      orderPayload.delivery_addr_district = addrParsed.district;
      orderPayload.delivery_addr_city = addrParsed.city;
      orderPayload.delivery_addr_state = addrParsed.state;
      orderPayload.delivery_addr_postcode = addrParsed.postcode;
      orderPayload.delivery_addr_country = addrParsed.country;
      orderPayload.delivery_lat = addrParsed.lat;
      orderPayload.delivery_lng = addrParsed.lng;
      orderPayload.delivery_place_id = addrParsed.placeId;
      orderPayload.delivery_display_name = addrParsed.displayName;
      orderPayload.delivery_raw = addrParsed.raw;
    }

    const { data: order, error: orderErr } = await supabaseAdmin.from("orders").insert(orderPayload).select("*").single();
    if (orderErr) return NextResponse.json({ ok: false, error: "Failed to create order", detail: orderErr }, { status: 500 });

    // 3) create order_lines
    const orderId = order.id as string;

    const linesToInsert = body.lines.map((l) => {
      const options_snapshot: any = {};
      if (l.sugar_value_code) options_snapshot.sugar_value_code = l.sugar_value_code;

      return {
        order_id: orderId,
        product_id: l.product_id,
        product_name_snapshot: l.product_name_snapshot || "",
        price_key_snapshot: l.size,
        unit_price_snapshot: Number(l.unit_price_snapshot || 0),
        qty: Number(l.qty),
        options_snapshot,
        line_total: Number(l.line_total || 0),
        note: l.note || null,
      };
    });

    const { error: linesErr } = await supabaseAdmin.from("order_lines").insert(linesToInsert);
    if (linesErr) return NextResponse.json({ ok: false, error: "Failed to create order lines", detail: linesErr }, { status: 500 });
