import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8459588064:AAEeHFwkr0hnaM19rVZyy3isJgsBQgabJ78";

// GET: Check current webhook info
export async function GET() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const data = await res.json();
    
    return NextResponse.json({
      ok: true,
      webhook_info: data.result,
      instructions: "POST với { webhook_url: 'https://your-domain.com' } để set webhook"
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST: Set webhook URL
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { webhook_url } = body;
    
    if (!webhook_url) {
      // Try to auto-detect from request headers
      const origin = req.headers.get("origin") || req.headers.get("referer");
      if (origin) {
        const baseUrl = new URL(origin).origin;
        const fullUrl = `${baseUrl}/api/telegram/webhook`;
        
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: fullUrl }),
        });
        const data = await res.json();
        
        return NextResponse.json({
          ok: data.ok,
          webhook_url: fullUrl,
          telegram_response: data,
        });
      }
      
      return NextResponse.json({ 
        ok: false, 
        error: "Missing webhook_url. POST với { webhook_url: 'https://your-domain.com' }" 
      }, { status: 400 });
    }
    
    // Set the provided webhook URL
    const fullUrl = webhook_url.endsWith("/api/telegram/webhook") 
      ? webhook_url 
      : `${webhook_url}/api/telegram/webhook`;
    
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: fullUrl }),
    });
    const data = await res.json();
    
    return NextResponse.json({
      ok: data.ok,
      webhook_url: fullUrl,
      telegram_response: data,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// DELETE: Remove webhook (for testing with polling)
export async function DELETE() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
    const data = await res.json();
    
    return NextResponse.json({
      ok: data.ok,
      message: "Webhook removed. Bot will use long polling now.",
      telegram_response: data,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
