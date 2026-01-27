"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

export default function LoginPage() {
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
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <div>Checking session...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ width: 420, border: "1px solid #333", borderRadius: 12, padding: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 10 }}>POS Login</h1>
        
        {errorParam === "domain_not_allowed" && (
          <div style={{ 
            padding: 12, 
            marginBottom: 12, 
            background: "#fee", 
            color: "#c00", 
            borderRadius: 8,
            fontSize: 14
          }}>
            Email domain not allowed. Contact administrator.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ marginBottom: 6, opacity: 0.8 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@domain.com"
              autoComplete="email"
              style={{ padding: 10, width: "100%" }}
            />
          </div>

          <div>
            <div style={{ marginBottom: 6, opacity: 0.8 }}>Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              style={{ padding: 10, width: "100%" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: loading ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.25)",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            type="button"
            onClick={onLogout}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: 0.8,
            }}
          >
            Logout (nếu đang login)
          </button>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
            Tạo user nhanh: Supabase Dashboard → Authentication → Users → Add user → set email & password.
          </div>
        </form>
      </div>
    </main>
  );
}
