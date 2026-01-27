import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function normalizePhone(input: string) {
  // lấy digits thôi, tránh "03 775 386 25" bị lệch
  return (input || "").replace(/\D/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phoneRaw = searchParams.get("phone") || "";
    const phone = normalizePhone(phoneRaw);

    if (!phone) {
      return NextResponse.json({ customer: null }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, phone_number, customer_name, default_address")
      .eq("phone_number", phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
