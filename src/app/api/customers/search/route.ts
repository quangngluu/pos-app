import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function norm(q: string) {
  return (q || "").trim();
}
function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = norm(searchParams.get("q") || "");
    const limit = Math.min(Number(searchParams.get("limit") || 8), 20);

    if (!qRaw) return NextResponse.json({ items: [] }, { status: 200 });

    const qDigits = digitsOnly(qRaw);

    // Search by phone prefix if digits, else by name ilike
    let query = supabaseAdmin
      .from("customers")
      .select("id, phone_number, customer_name, default_address")
      .limit(limit);

    if (qDigits.length >= 3) {
      query = query.ilike("phone_number", `${qDigits}%`);
    } else {
      query = query.ilike("customer_name", `%${qRaw}%`);
    }

    const { data, error } = await query.order("id", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
