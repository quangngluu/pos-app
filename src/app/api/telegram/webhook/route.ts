import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  ORDER_STATUSES,
  OrderStatus,
  TELEGRAM_STATUS_LABELS,
  VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";

export const runtime = "nodejs";

// Hardcoded fallback token (same as send route) - in production, use env only
const FALLBACK_BOT_TOKEN = "8459588064:AAEeHFwkr0hnaM19rVZyy3isJgsBQgabJ78";

// Token loaded from environment with fallback
function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || FALLBACK_BOT_TOKEN;
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

// Answer callback query (acknowledge button press)
async function answerCallback(callbackQueryId: string, text: string, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
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
async function editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: any, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    }),
  });
}

// Send a message to a chat
async function sendMessage(chatId: number, text: string, token: string, replyMarkup?: any) {
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Get file download URL from Telegram
async function getFileUrl(fileId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
    }
    return null;
  } catch {
    return null;
  }
}

// In-memory store for pending image uploads (order_id -> chat_id mapping)
// In production, use Redis or database for persistence across instances
const pendingImageUploads = new Map<string, { chatId: number; messageId?: number; expiresAt: number }>();

// Clean up expired entries
function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of pendingImageUploads.entries()) {
    if (value.expiresAt < now) {
      pendingImageUploads.delete(key);
    }
  }
}

export async function POST(req: Request) {
  // Get bot token (always available due to fallback)
  const token = getTelegramBotToken();
  console.log("[Telegram Webhook] Received update, token available:", !!token);

  // Verify webhook secret if configured (optional but recommended)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (headerSecret !== webhookSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const update = await req.json();
    
    // Handle callback query (button press)
    if (update.callback_query) {
      const { id: callbackId, data, message, from } = update.callback_query;
      const chatId = message?.chat?.id;
      const messageId = message?.message_id;
      
      console.log(`[Telegram Callback] User ${from?.username || from?.id} pressed: ${data}`);
      
      if (!data) {
        console.log("[Telegram Callback] No data in callback");
        await answerCallback(callbackId, "Invalid callback", token);
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
          
        const status = (order?.status || "PLACED") as OrderStatus;
        await answerCallback(callbackId, `Đơn #${order?.order_code}: ${TELEGRAM_STATUS_LABELS[status]}`, token);
        return NextResponse.json({ ok: true });
      }
      
      if (action === "image") {
        // User wants to send an image for this order
        // Store pending upload state
        cleanupExpired();
        pendingImageUploads.set(orderId, {
          chatId,
          messageId,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
        });
        
        await answerCallback(callbackId, "📷 Vui lòng gửi hình ảnh cho đơn hàng này", token);
        
        // Send instruction message
        await sendMessage(
          chatId,
          `📷 *Gửi hình ảnh cho đơn hàng*\n\nVui lòng gửi hình ảnh (photo) trong vòng 5 phút.\n\n_Hình ảnh sẽ được lưu vào đơn hàng._`,
          token,
          {
            inline_keyboard: [[{
              text: "❌ Huỷ",
              callback_data: `cancel_image:${orderId}`,
            }]],
          }
        );
        
        return NextResponse.json({ ok: true });
      }
      
      if (action === "cancel_image") {
        // Cancel pending image upload
        pendingImageUploads.delete(orderId);
        await answerCallback(callbackId, "Đã huỷ gửi hình ảnh", token);
        return NextResponse.json({ ok: true });
      }
      
      if (action === "status") {
        const newStatus = parts[2] as OrderStatus;
        
        if (!ORDER_STATUSES.includes(newStatus)) {
          await answerCallback(callbackId, "Trạng thái không hợp lệ", token);
          return NextResponse.json({ ok: true });
        }
        
        // Get current order
        const { data: order, error: fetchErr } = await supabaseAdmin
          .from("orders")
          .select("status, order_code")
          .eq("id", orderId)
          .single();
          
        if (fetchErr || !order) {
          await answerCallback(callbackId, "Không tìm thấy đơn hàng", token);
          return NextResponse.json({ ok: true });
        }
        
        // Validate status transition using VALID_TRANSITIONS
        const currentStatus = order.status as OrderStatus;
        const allowedNext = VALID_TRANSITIONS[currentStatus];
        
        if (!allowedNext.includes(newStatus)) {
          await answerCallback(callbackId, "Không thể chuyển sang trạng thái này", token);
          return NextResponse.json({ ok: true });
        }
        
        // Update order status (only status field - timestamp columns may not exist)
        const updateData: Record<string, any> = { status: newStatus };
        
        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update(updateData)
          .eq("id", orderId);
          
        if (updateErr) {
          console.error("[Telegram Callback] Update order status error:", updateErr);
          await answerCallback(callbackId, "Lỗi cập nhật trạng thái", token);
          return NextResponse.json({ ok: true });
        }
        
        console.log(`[Telegram Callback] Order ${order.order_code} status updated to ${newStatus}`);
        
        // Update message buttons
        if (chatId && messageId) {
          await editMessageReplyMarkup(chatId, messageId, buildStatusKeyboard(orderId, newStatus), token);
        }
        
        // Send confirmation with answerCbQuery
        await answerCallback(callbackId, `✅ Đã chuyển sang: ${TELEGRAM_STATUS_LABELS[newStatus]}`, token);
        
        // Also send a new message to confirm
        await sendMessage(
          chatId,
          `✅ *Đơn #${order.order_code}* đã được cập nhật\n\nTrạng thái mới: *${TELEGRAM_STATUS_LABELS[newStatus]}*`,
          token
        );
        
        return NextResponse.json({ ok: true });
      }
      
      await answerCallback(callbackId, "Unknown action", token);
      return NextResponse.json({ ok: true });
    }
    
    // Handle photo messages
    if (update.message?.photo) {
      const message = update.message;
      const chatId = message.chat?.id;
      const photos = message.photo; // Array of PhotoSize objects, sorted by size
      
      if (!chatId || !photos || photos.length === 0) {
        return NextResponse.json({ ok: true });
      }
      
      // Get the largest photo (last in array)
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;
      
      // Check if there's a pending image upload for any order from this chat
      cleanupExpired();
      let matchedOrderId: string | null = null;
      
      for (const [orderId, pending] of pendingImageUploads.entries()) {
        if (pending.chatId === chatId) {
          matchedOrderId = orderId;
          break;
        }
      }
      
      if (!matchedOrderId) {
        // No pending upload - inform user
        await sendMessage(
          chatId,
          "⚠️ Không có đơn hàng nào đang chờ hình ảnh.\n\nVui lòng nhấn nút \"📷 Gửi hình ảnh\" trong tin nhắn đơn hàng trước.",
          token
        );
        return NextResponse.json({ ok: true });
      }
      
      // Get file URL from Telegram
      const fileUrl = await getFileUrl(fileId, token);
      
      // Get order info
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, order_code, status, images")
        .eq("id", matchedOrderId)
        .single();
      
      if (orderErr || !order) {
        await sendMessage(chatId, "❌ Không tìm thấy đơn hàng.", token);
        pendingImageUploads.delete(matchedOrderId);
        return NextResponse.json({ ok: true });
      }
      
      // Store image info in order
      const existingImages = Array.isArray(order.images) ? order.images : [];
      const newImage = {
        file_id: fileId,
        file_url: fileUrl,
        uploaded_at: new Date().toISOString(),
        source: "telegram",
      };
      
      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update({
          images: [...existingImages, newImage],
        })
        .eq("id", matchedOrderId);
      
      // Clean up pending upload
      pendingImageUploads.delete(matchedOrderId);
      
      if (updateErr) {
        console.error("Failed to save image:", updateErr);
        await sendMessage(chatId, "❌ Lỗi lưu hình ảnh. Vui lòng thử lại.", token);
        return NextResponse.json({ ok: true });
      }
      
      // Send success message
      const imageCount = existingImages.length + 1;
      await sendMessage(
        chatId,
        `✅ *Đã nhận hình ảnh!*\n\nĐơn hàng #${order.order_code} hiện có ${imageCount} hình ảnh.\n\n_Cảm ơn bạn đã gửi hình ảnh._`,
        token
      );
      
      return NextResponse.json({ ok: true });
    }
    
    // Handle text messages (for potential order ID replies)
    if (update.message?.text) {
      // Could implement order lookup by code here if needed
      return NextResponse.json({ ok: true });
    }
    
    // Other update types - ignore
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram webhook error:", e);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// GET is disabled to prevent public access in production
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
