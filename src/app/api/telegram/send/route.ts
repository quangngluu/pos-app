import { NextResponse } from "next/server";
import { sendTelegramOrderMessage } from "@/app/lib/telegramAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, chat_id, order_id, order_code } = body;

    if (!message) {
      return jsonError("Missing message", 400);
    }

    const origin = req.headers.get("origin") || req.headers.get("referer");
    let baseUrl;
    if (origin) {
      baseUrl = new URL(origin).origin;
    }

    const res = await sendTelegramOrderMessage({
      message,
      chat_id,
      order_id,
      order_code,
      baseUrl
    });

    if (!res.ok) {
      return jsonError(res.error || "Telegram send error", 500);
    }

    return NextResponse.json({ ok: true, message_id: res.message_id });
  } catch (e: any) {
    console.error("Telegram send API error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
