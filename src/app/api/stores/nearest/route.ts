import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const limitStr = searchParams.get("limit") || "5";
    const limit = Math.min(Math.max(Number(limitStr), 1), 20);

    if (!lat || !lng) {
      return jsonError("MISSING_LAT_LNG: lat and lng query parameters are required", 400);
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return jsonError("Invalid lat or lng values", 400);
    }

    // Call RPC function (updated to use p_lat/p_lng parameter names)
    const { data, error } = await supabaseAdmin.rpc("nearest_store", {
      p_lat: latNum,
      p_lng: lngNum,
      limit_n: limit,
    });

    if (error) {
      console.error("RPC nearest_store error:", error);
      console.error("RPC params:", { p_lat: latNum, p_lng: lngNum, limit });
      return jsonError(`RPC error: ${error.message || JSON.stringify(error)}`, 500);
    }

    console.log("RPC nearest_store success:", {
      p_lat: latNum,
      p_lng: lngNum,
      resultCount: data?.length || 0,
      results: data,
    });

    // Filter out stores with null distance and round to whole meters
    const items = (data || [])
      .filter((store: any) => Number.isFinite(store.distance_m))
      .map((store: any) => ({
        id: store.id,
        name: store.name,
        address_full: store.address_full,
        distance_m: Math.round(store.distance_m),
      }));

    console.log("Filtered items:", { count: items.length, items });

    return NextResponse.json(
      { ok: true, items },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error("Nearest stores error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
