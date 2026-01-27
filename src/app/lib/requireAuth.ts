import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type User = {
  id: string;
  email?: string;
  [key: string]: any;
};

type AuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * Requires authenticated user for API route handlers.
 * Returns user or NextResponse with 401/403.
 * 
 * Usage in route.ts:
 * ```
 * const auth = await requireUser();
 * if (!auth.ok) return auth.response;
 * const { user } = auth;
 * ```
 */
export async function requireUser(): Promise<AuthResult> {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore errors from Server Components
          }
        },
      },
    }
  );

  // Get user (validates JWT signature)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  // Optional: Check email domain allowlist
  const allowedDomain = process.env.INTERNAL_EMAIL_DOMAIN;
  if (allowedDomain && user.email) {
    const emailDomain = `@${allowedDomain}`;
    if (!user.email.endsWith(emailDomain)) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "FORBIDDEN: Email domain not allowed" },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, user };
}
