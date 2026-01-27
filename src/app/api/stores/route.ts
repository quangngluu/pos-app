import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limitStr = searchParams.get("limit") || "10";
    const limit = Math.min(Math.max(Number(limitStr), 1), 20);

    let query = supabaseAdmin
      .from("stores")
      .select("id, name, address_full")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(limit);

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Stores query error:", error);
      return jsonError("Failed to fetch stores", 500);
    }

    return NextResponse.json(
      { ok: true, items: data || [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error("Stores error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
