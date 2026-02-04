import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  ORDER_STATUSES,
  OrderStatus,
  TELEGRAM_STATUS_LABELS,
  VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = "8459588064:AAEeHFwkr0hnaM19rVZyy3isJgsBQgabJ78";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ""; // Set this in env

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Build inline keyboard for status buttons
function buildStatusKeyboard(orderId: string, currentStatus: OrderStatus) {
  const validNext = VALID_TRANSITIONS[currentStatus].filter(s => s !== "CANCELLED");
  
  const buttons = [];
  
  // Show next status button if available
  if (validNext.length > 0) {
    const nextStatus = validNext[0];
    buttons.push([{
      text: `➡️ ${TELEGRAM_STATUS_LABELS[nextStatus]}`,
      callback_data: `status:${orderId}:${nextStatus}`,
    }]);
  }
  
  // Add send image button (only for non-completed orders)
  if (currentStatus !== "COMPLETED" && currentStatus !== "CANCELLED") {
    buttons.push([{
      text: `📷 Gửi hình ảnh`,
      callback_data: `image:${orderId}`,
    }]);
  }
  
  // Show current status as info
  buttons.push([{
    text: `📋 Trạng thái: ${TELEGRAM_STATUS_LABELS[currentStatus]}`,
    callback_data: `info:${orderId}`,
  }]);
  
  return { inline_keyboard: buttons };
}

// Auto-setup webhook if not already set
async function ensureWebhookSetup(baseUrl: string) {
  try {
    // Check current webhook
    const infoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const info = await infoRes.json();
    
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    
    // If webhook is not set or different, set it
    if (!info.result?.url || info.result.url !== webhookUrl) {
      console.log(`Setting Telegram webhook to: ${webhookUrl}`);
      const setRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const setData = await setRes.json();
      console.log("Webhook setup result:", setData);
    }
  } catch (e) {
    console.error("Failed to setup webhook:", e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, chat_id, order_id, order_code } = body;

    if (!message) {
      return jsonError("Missing message", 400);
    }

    const targetChatId = chat_id || TELEGRAM_CHAT_ID;
    if (!targetChatId) {
      return jsonError("Missing chat_id", 400);
    }

    // Auto-setup webhook using request origin
    const origin = req.headers.get("origin") || req.headers.get("referer");
    if (origin) {
      const baseUrl = new URL(origin).origin;
      // Run in background, don't block
      ensureWebhookSetup(baseUrl).catch(() => {});
    }

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    // Build request body with inline keyboard if order_id provided
    const telegramBody: any = {
      chat_id: targetChatId,
      text: order_code ? `🆕 *ĐƠN HÀNG #${order_code}*\n\n${message}` : message,
      parse_mode: "Markdown",
    };
    
    // Add inline keyboard for status buttons if order_id provided
    if (order_id) {
      telegramBody.reply_markup = buildStatusKeyboard(order_id, "PLACED");
    }
    
    const res = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telegramBody),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("Telegram API error:", data);
      return jsonError(data.description || "Telegram API error", 500);
    }

    const messageId = data.result?.message_id;
    
    // Save telegram message_id to order for later editing
    if (order_id && messageId) {
      await supabaseAdmin
        .from("orders")
        .update({ 
          telegram_message_id: messageId,
          status: "PLACED",
          status_placed_at: new Date().toISOString(),
        })
        .eq("id", order_id);
    }

    return NextResponse.json({ ok: true, message_id: messageId });
  } catch (e: any) {
    console.error("Telegram send error:", e);
    return jsonError(e?.message ?? "Unknown error", 500);
  }
}
