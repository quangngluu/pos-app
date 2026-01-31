import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/lib/requireAuth";

// Validation schemas
const createStoreSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address_full: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  // Structured address fields from Google Places
  addr_line1: z.string().nullable().optional(),
  addr_ward: z.string().nullable().optional(),
  addr_district: z.string().nullable().optional(),
  addr_city: z.string().nullable().optional(),
  addr_state: z.string().nullable().optional(),
  addr_postcode: z.string().nullable().optional(),
  addr_country: z.string().nullable().optional(),
  addr_place_id: z.string().nullable().optional(),
  addr_display_name: z.string().nullable().optional(),
  addr_raw: z.any().nullable().optional(),
});

const patchStoreSchema = z.object({
  id: z.string().uuid("Invalid store ID"),
  patch: z.object({
    name: z.string().min(1).optional(),
    address_full: z.string().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    is_active: z.boolean().optional(),
    // Structured address fields
    addr_line1: z.string().nullable().optional(),
    addr_ward: z.string().nullable().optional(),
    addr_district: z.string().nullable().optional(),
    addr_city: z.string().nullable().optional(),
    addr_state: z.string().nullable().optional(),
    addr_postcode: z.string().nullable().optional(),
    addr_country: z.string().nullable().optional(),
    addr_place_id: z.string().nullable().optional(),
    addr_display_name: z.string().nullable().optional(),
    addr_raw: z.any().nullable().optional(),
  }),
});

// GET /api/admin/stores?q=
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  try {
    let query = supabaseAdmin
      .from("stores")
      .select(`
        id, name, address_full, is_active, lat, lng, 
        addr_line1, addr_ward, addr_district, addr_city, addr_state, 
        addr_postcode, addr_country, addr_place_id, addr_display_name,
        updated_at, created_at
      `)
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`name.ilike.%${q}%,address_full.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ ok: true, stores: data || [] });
  } catch (error: any) {
    console.error("GET /api/admin/stores error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch stores" },
      { status: 500 }
    );
  }
}

// POST /api/admin/stores
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = createStoreSchema.parse(body);

    // Derive address_full from addr_display_name (formattedAddress) if available
    const addressFull = validated.addr_display_name || validated.address_full || validated.addr_line1 || null;

    const { data, error } = await supabaseAdmin
      .from("stores")
      .insert({
        name: validated.name,
        address_full: addressFull,
        lat: validated.lat ?? null,
        lng: validated.lng ?? null,
        is_active: validated.is_active,
        addr_line1: validated.addr_line1 ?? null,
        addr_ward: validated.addr_ward ?? null,
        addr_district: validated.addr_district ?? null,
        addr_city: validated.addr_city ?? null,
        addr_state: validated.addr_state ?? null,
        addr_postcode: validated.addr_postcode ?? null,
        addr_country: validated.addr_country ?? null,
        addr_place_id: validated.addr_place_id ?? null,
        addr_display_name: validated.addr_display_name ?? null,
        addr_raw: validated.addr_raw ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, store: data });
  } catch (error: any) {
    console.error("POST /api/admin/stores error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create store" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/stores
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validated = patchStoreSchema.parse(body);

    const updateData: any = { ...validated.patch, updated_at: new Date().toISOString() };

    // Derive address_full from addr_display_name if provided
    if (validated.patch.addr_display_name !== undefined) {
      updateData.address_full = validated.patch.addr_display_name || validated.patch.address_full || validated.patch.addr_line1 || null;
    } else if (validated.patch.address_full !== undefined && !updateData.address_full) {
      updateData.address_full = validated.patch.address_full;
    }

    // Include lat/lng if provided in patch
    if (validated.patch.lat !== undefined) {
      updateData.lat = validated.patch.lat;
    }
    if (validated.patch.lng !== undefined) {
      updateData.lng = validated.patch.lng;
    }

    const { data, error } = await supabaseAdmin
      .from("stores")
      .update(updateData)
      .eq("id", validated.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, store: data });
  } catch (error: any) {
    console.error("PATCH /api/admin/stores error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update store" },
      { status: 500 }
    );
  }
}
