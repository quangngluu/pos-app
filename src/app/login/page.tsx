"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";
import { Button, Input, Card } from "@/app/components";
import { colors, spacing, typography } from "@/app/lib/designTokens";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const redirectTo = searchParams.get("redirect") || "/pos";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if already logged in
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        // Already logged in, redirect to intended destination
        router.replace(redirectTo);
        return;
      }

      setCheckingSession(false);
    })();

    return () => {
      alive = false;
    };
  }, [router, redirectTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const eTrim = email.trim();
    if (!eTrim || !password) {
      alert("Nhập email + password trước nhé.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: eTrim,
        password,
      });

      if (error) {
        alert(error.message);
        return;
      }

      // Success - redirect to intended destination
      router.replace(redirectTo);
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      alert("Đã logout");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main style={{ padding: spacing['24'], fontFamily: typography.fontFamily.sans }}>
        <div>Checking session...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: spacing['24'],
        fontFamily: typography.fontFamily.sans,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        backgroundColor: colors.bg.secondary,
      }}
    >
      <Card style={{ width: 420 }}>
        <h1 style={{ 
          marginTop: 0, 
          marginBottom: spacing['16'], 
          fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
        }}>
          POS Login
        </h1>
        
        {errorParam === "domain_not_allowed" && (
          <div style={{ 
            padding: spacing['12'], 
            marginBottom: spacing['16'], 
            backgroundColor: `rgba(239, 68, 68, 0.1)`,
            color: colors.status.error,
            borderRadius: '8px',
            fontSize: typography.fontSize.sm,
            border: `1px solid ${colors.status.error}`,
          }}>
            Email domain not allowed. Contact administrator.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: spacing['16'] }}>
          <Input
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@domain.com"
            autoComplete="email"
            type="email"
          />

          <Input
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
          />

          <Button
            type="submit"
            disabled={loading}
            variant="primary"
            fullWidth
            style={{ marginTop: spacing['8'] }}
          >
            {loading ? "Logging in..." : "Login"}
          </Button>

          <Button
            type="button"
            onClick={onLogout}
            disabled={loading}
            variant="secondary"
            fullWidth
          >
            Logout (nếu đang login)
          </Button>

          <div style={{ 
            marginTop: spacing['4'], 
            fontSize: typography.fontSize.xs, 
            color: colors.text.tertiary,
            lineHeight: typography.lineHeight.normal,
          }}>
            Tạo user nhanh: Supabase Dashboard → Authentication → Users → Add user → set email & password.
          </div>
        </form>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

