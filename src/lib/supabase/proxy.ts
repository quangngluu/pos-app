import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check authentication for protected routes
  const { pathname } = request.nextUrl;
  
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api/");
  const isPosRoute = pathname.startsWith("/pos");
  const isAdminRoute = pathname.startsWith("/admin");
  const requiresAuth = isApiRoute || isPosRoute || isAdminRoute;

  // If route requires auth and user not logged in
  if (requiresAuth && !user) {
    if (isApiRoute) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 }
      );
    } else {
      // Redirect to login with return path
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Optional: Check email domain allowlist
  if (requiresAuth && user) {
    const allowedDomain = process.env.INTERNAL_EMAIL_DOMAIN;
    if (allowedDomain && user.email) {
      const emailDomain = `@${allowedDomain}`;
      if (!user.email.endsWith(emailDomain)) {
        if (isApiRoute) {
          return NextResponse.json(
            { ok: false, error: "FORBIDDEN: Email domain not allowed" },
            { status: 403 }
          );
        } else {
          const redirectUrl = new URL("/login", request.url);
          redirectUrl.searchParams.set("error", "domain_not_allowed");
          return NextResponse.redirect(redirectUrl);
        }
      }
    }
  }

  return supabaseResponse;
}
