import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/health — check environment variables are configured
 * Returns which vars are set (not values, just presence)
 */
export async function GET() {
    const envChecks: Record<string, boolean> = {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: !!process.env.TELEGRAM_CHAT_ID,
        OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        GOOGLE_PLACE_API_KEY: !!process.env.GOOGLE_PLACE_API_KEY,
        DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    };

    const missing = Object.entries(envChecks).filter(([, v]) => !v).map(([k]) => k);

    return NextResponse.json({
        ok: missing.length === 0,
        env: envChecks,
        missing,
        timestamp: new Date().toISOString(),
    });
}
