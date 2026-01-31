import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = "8459588064:AAEeHFwkr0hnaM19rVZyy3isJgsBQgabJ78";

// Status labels in Vietnamese
const STATUS_LABELS: Record<string, string> = {
  PLACED: "📤 Đã bắn đơn",
  CONFIRMED: "✅ Cơ sở xác nhận",
  SHIPPING: "🚚 Đang vận chuyển",
  COMPLETED: "🎉 Hoàn thành",
};

// Build inline keyboard for status buttons
function buildStatusKeyboard(orderId: string, currentStatus: string) {
  const statuses = ["PLACED", "CONFIRMED", "SHIPPING", "COMPLETED"];
  const currentIdx = statuses.indexOf(currentStatus);
  
  const buttons = [];
  
  // Show next status button if not completed
  if (currentIdx < statuses.length - 1) {
    const nextStatus = statuses[currentIdx + 1];
    buttons.push([{
      text: `➡️ ${STATUS_LABELS[nextStatus]}`,
      callback_data: `status:${orderId}:${nextStatus}`,
    }]);
  }
  
  // Show current status as info
  buttons.push([{
    text: `📋 Trạng thái: ${STATUS_LABELS[currentStatus]}`,
    callback_data: `info:${orderId}`,
  }]);
  
  return { inline_keyboard: buttons };
}

// Answer callback query (acknowledge button press)
async function answerCallback(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
}

// Edit message reply markup (update buttons)
async function editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: any) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const update = await req.json();
    
    // Handle callback query (button press)
    if (update.callback_query) {
      const { id: callbackId, data, message } = update.callback_query;
      const chatId = message?.chat?.id;
      const messageId = message?.message_id;
      
      if (!data) {
        await answerCallback(callbackId, "Invalid callback");
        return NextResponse.json({ ok: true });
      }
      
      // Parse callback data: "status:orderId:newStatus" or "info:orderId"
      const parts = data.split(":");
      const action = parts[0];
      const orderId = parts[1];
      
      if (action === "info") {
        // Just show current status
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("status, order_code")
          .eq("id", orderId)
          .single();
          
        const status = order?.status || "PLACED";
        await answerCallback(callbackId, `Đơn #${order?.order_code}: ${STATUS_LABELS[status]}`);
        return NextResponse.json({ ok: true });
      }
      
      if (action === "status") {
        const newStatus = parts[2];
        
        if (!["PLACED", "CONFIRMED", "SHIPPING", "COMPLETED"].includes(newStatus)) {
          await answerCallback(callbackId, "Trạng thái không hợp lệ");
          return NextResponse.json({ ok: true });
        }
        
        // Get current order
        const { data: order, error: fetchErr } = await supabaseAdmin
          .from("orders")
          .select("status, order_code")
          .eq("id", orderId)
          .single();
          
        if (fetchErr || !order) {
          await answerCallback(callbackId, "Không tìm thấy đơn hàng");
          return NextResponse.json({ ok: true });
        }
        
        // Validate status transition (can only move forward)
        const statuses = ["PLACED", "CONFIRMED", "SHIPPING", "COMPLETED"];
        const currentIdx = statuses.indexOf(order.status);
        const newIdx = statuses.indexOf(newStatus);
        
        if (newIdx <= currentIdx) {
          await answerCallback(callbackId, "Không thể quay lại trạng thái trước");
          return NextResponse.json({ ok: true });
        }
        
        // Update order status
        const updateData: any = { status: newStatus };
        const now = new Date().toISOString();
        
        if (newStatus === "CONFIRMED") updateData.status_confirmed_at = now;
        if (newStatus === "SHIPPING") updateData.status_shipping_at = now;
        if (newStatus === "COMPLETED") updateData.status_completed_at = now;
        
        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update(updateData)
          .eq("id", orderId);
          
        if (updateErr) {
          console.error("Update order status error:", updateErr);
          await answerCallback(callbackId, "Lỗi cập nhật trạng thái");
          return NextResponse.json({ ok: true });
        }
        
        // Update message buttons
        if (chatId && messageId) {
          await editMessageReplyMarkup(chatId, messageId, buildStatusKeyboard(orderId, newStatus));
        }
        
        await answerCallback(callbackId, `✅ Đã chuyển sang: ${STATUS_LABELS[newStatus]}`);
        return NextResponse.json({ ok: true });
      }
      
      await answerCallback(callbackId, "Unknown action");
      return NextResponse.json({ ok: true });
    }
    
    // Other update types (messages, etc.) - ignore for now
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram webhook error:", e);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// GET endpoint to set webhook URL
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  
  if (action === "set") {
    // Set webhook to this endpoint
    const webhookUrl = searchParams.get("url");
    if (!webhookUrl) {
      return NextResponse.json({ ok: false, error: "Missing url param" }, { status: 400 });
    }
    
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    
    const data = await res.json();
    return NextResponse.json(data);
  }
  
  if (action === "info") {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json(data);
  }
  
  if (action === "delete") {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
    const data = await res.json();
    return NextResponse.json(data);
  }
  
  return NextResponse.json({ 
    ok: true, 
    message: "Telegram webhook endpoint",
    actions: {
      set: "GET /api/telegram/webhook?action=set&url=YOUR_WEBHOOK_URL",
      info: "GET /api/telegram/webhook?action=info",
      delete: "GET /api/telegram/webhook?action=delete",
    }
  });
}
