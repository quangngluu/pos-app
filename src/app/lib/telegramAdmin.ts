import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
    OrderStatus,
    TELEGRAM_STATUS_LABELS,
    VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";

function getTelegramBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set");
    }
    return token;
}

function getTelegramChatId(): string {
    return process.env.TELEGRAM_CHAT_ID || "";
}

// Build inline keyboard for status buttons
export function buildStatusKeyboard(orderId: string, currentStatus: OrderStatus) {
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
export async function ensureWebhookSetup(baseUrl: string) {
    try {
        // Check current webhook
        const infoRes = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/getWebhookInfo`);
        const info = await infoRes.json();

        const webhookUrl = `${baseUrl}/api/telegram/webhook`;

        // If webhook is not set or different, set it
        if (!info.result?.url || info.result.url !== webhookUrl) {
            console.log(`Setting Telegram webhook to: ${webhookUrl}`);
            const setRes = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/setWebhook`, {
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

export async function sendTelegramOrderMessage(params: {
    message: string;
    order_id?: string;
    order_code?: string;
    chat_id?: string;
    baseUrl?: string;
}) {
    const { message, order_id, order_code, chat_id, baseUrl } = params;
    const targetChatId = chat_id || getTelegramChatId();

    if (!targetChatId) {
        return { ok: false, error: "Missing chat_id" };
    }

    if (baseUrl) {
        // Run in background, don't block
        ensureWebhookSetup(baseUrl).catch(() => { });
    }

    const telegramUrl = `https://api.telegram.org/bot${getTelegramBotToken()}/sendMessage`;

    const telegramBody: any = {
        chat_id: targetChatId,
        text: order_code ? `🆕 *ĐƠN HÀNG #${order_code}*\n\n${message}` : message,
        parse_mode: "Markdown",
    };

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
        return { ok: false, error: data.description || "Telegram API error" };
    }

    const messageId = data.result?.message_id;

    if (order_id && messageId) {
        // Avoid resetting order status entirely to PLACED when message is just sent, 
        // unless it is actually new. The `orders/route.ts` creates as PLACED by default.
        // So just attach the `telegram_message_id`.
        await supabaseAdmin
            .from("orders")
            .update({
                telegram_message_id: messageId
            })
            .eq("id", order_id);
    }

    return { ok: true, message_id: messageId };
}
