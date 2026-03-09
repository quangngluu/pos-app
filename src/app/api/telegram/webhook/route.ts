import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  ORDER_STATUSES,
  OrderStatus,
  TELEGRAM_STATUS_LABELS,
  VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";

export const runtime = "nodejs";

// Token loaded from environment (required)
function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set");
  }
  return token;
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

// ── DB-backed pending uploads (replaces in-memory Map) ──

async function setPendingUpload(orderId: string, chatId: number, telegramUserId: number, messageId?: number) {
  // Upsert: one pending upload per telegram user (unique constraint handles conflicts)
  await supabaseAdmin
    .from("telegram_pending_uploads")
    .upsert({
      order_id: orderId,
      chat_id: chatId,
      telegram_user_id: telegramUserId,
      message_id: messageId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }, { onConflict: "telegram_user_id" });
}

async function getPendingUpload(telegramUserId: number) {
  // Find pending upload for THIS specific user (not by chat_id)
  const { data } = await supabaseAdmin
    .from("telegram_pending_uploads")
    .select("order_id, chat_id, message_id")
    .eq("telegram_user_id", telegramUserId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return data;
}

async function deletePendingUpload(telegramUserId: number) {
  await supabaseAdmin
    .from("telegram_pending_uploads")
    .delete()
    .eq("telegram_user_id", telegramUserId);
}

async function cleanupExpiredUploads() {
  await supabaseAdmin
    .from("telegram_pending_uploads")
    .delete()
    .lt("expires_at", new Date().toISOString());
}

// ── Webhook handler ──

export async function POST(req: Request) {
  const token = getTelegramBotToken();

  // Verify webhook secret if configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (headerSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const update = await req.json();

    // Handle callback query (button press)
    if (update.callback_query) {
      const { id: callbackId, data, message, from } = update.callback_query;
      const chatId = message?.chat?.id;
      const messageId = message?.message_id;
      const telegramUserId = from?.id;

      console.log(`[Telegram Callback] User ${from?.username || telegramUserId} pressed: ${data}`);

      if (!data) {
        await answerCallback(callbackId, "Invalid callback", token);
        return NextResponse.json({ ok: true });
      }

      const parts = data.split(":");
      const action = parts[0];
      const orderId = parts[1];

      if (action === "info") {
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
        // Store pending upload in DB, scoped to this telegram user
        await setPendingUpload(orderId, chatId, telegramUserId, messageId);

        await answerCallback(callbackId, "Vui lòng gửi hình ảnh cho đơn hàng này", token);

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("order_code")
          .eq("id", orderId)
          .single();

        await sendMessage(
          chatId,
          `*Gửi hình ảnh cho đơn #${order?.order_code || "?"}*\n\nVui lòng gửi hình ảnh (photo) trong vòng 5 phút.`,
          token,
          {
            inline_keyboard: [[{
              text: "Huỷ",
              callback_data: `cancel_image:${orderId}`,
            }]],
          }
        );

        return NextResponse.json({ ok: true });
      }

      if (action === "cancel_image") {
        if (telegramUserId) await deletePendingUpload(telegramUserId);
        await answerCallback(callbackId, "Đã huỷ gửi hình ảnh", token);
        return NextResponse.json({ ok: true });
      }

      if (action === "status") {
        const newStatus = parts[2] as OrderStatus;

        if (!ORDER_STATUSES.includes(newStatus)) {
          await answerCallback(callbackId, "Trạng thái không hợp lệ", token);
          return NextResponse.json({ ok: true });
        }

        const { data: order, error: fetchErr } = await supabaseAdmin
          .from("orders")
          .select("status, order_code")
          .eq("id", orderId)
          .single();

        if (fetchErr || !order) {
          await answerCallback(callbackId, "Không tìm thấy đơn hàng", token);
          return NextResponse.json({ ok: true });
        }

        const currentStatus = order.status as OrderStatus;
        const allowedNext = VALID_TRANSITIONS[currentStatus];

        if (!allowedNext.includes(newStatus)) {
          await answerCallback(callbackId, "Không thể chuyển sang trạng thái này", token);
          return NextResponse.json({ ok: true });
        }

        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update({ status: newStatus })
          .eq("id", orderId);

        if (updateErr) {
          console.error("[Telegram Callback] Update order status error:", updateErr);
          await answerCallback(callbackId, "Lỗi cập nhật trạng thái", token);
          return NextResponse.json({ ok: true });
        }

        console.log(`[Telegram Callback] Order ${order.order_code} status updated to ${newStatus}`);

        // Update buttons on original message
        if (chatId && messageId) {
          await editMessageReplyMarkup(chatId, messageId, buildStatusKeyboard(orderId, newStatus), token);
        }

        await answerCallback(callbackId, `✅ Đã chuyển sang: ${TELEGRAM_STATUS_LABELS[newStatus]}`, token);

        await sendMessage(
          chatId,
          `Đơn *#${order.order_code}* → *${TELEGRAM_STATUS_LABELS[newStatus]}*`,
          token
        );

        return NextResponse.json({ ok: true });
      }

      await answerCallback(callbackId, "Unknown action", token);
      return NextResponse.json({ ok: true });
    }

    // Handle photo messages — match by TELEGRAM USER ID (not chat_id)
    if (update.message?.photo) {
      const message = update.message;
      const chatId = message.chat?.id;
      const telegramUserId = message.from?.id;
      const photos = message.photo;

      if (!chatId || !telegramUserId || !photos || photos.length === 0) {
        return NextResponse.json({ ok: true });
      }

      // Cleanup expired entries
      cleanupExpiredUploads().catch(() => { });

      // Find pending upload for THIS specific user
      const pending = await getPendingUpload(telegramUserId);

      if (!pending) {
        await sendMessage(
          chatId,
          "Không có đơn hàng nào đang chờ hình ảnh.\nNhấn nút \"Gửi hình ảnh\" trong tin nhắn đơn hàng trước.",
          token
        );
        return NextResponse.json({ ok: true });
      }

      // Get largest photo
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;
      const fileUrl = await getFileUrl(fileId, token);

      // Get order
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, order_code, status, images")
        .eq("id", pending.order_id)
        .single();

      if (orderErr || !order) {
        await sendMessage(chatId, "Không tìm thấy đơn hàng.", token);
        await deletePendingUpload(telegramUserId);
        return NextResponse.json({ ok: true });
      }

      // Save image to order
      const existingImages = Array.isArray(order.images) ? order.images : [];
      const newImage = {
        file_id: fileId,
        file_url: fileUrl,
        uploaded_at: new Date().toISOString(),
        source: "telegram",
        uploaded_by_telegram_user: telegramUserId,
      };

      const { error: updateErr } = await supabaseAdmin
        .from("orders")
        .update({ images: [...existingImages, newImage] })
        .eq("id", pending.order_id);

      // Clear pending
      await deletePendingUpload(telegramUserId);

      if (updateErr) {
        console.error("Failed to save image:", updateErr);
        await sendMessage(chatId, "Lỗi lưu hình ảnh. Vui lòng thử lại.", token);
        return NextResponse.json({ ok: true });
      }

      const imageCount = existingImages.length + 1;
      await sendMessage(
        chatId,
        `Đã nhận hình ảnh cho đơn *#${order.order_code}* (${imageCount} ảnh)`,
        token
      );

      return NextResponse.json({ ok: true });
    }

    // Other message types — ignore
    if (update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram webhook error:", e);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
