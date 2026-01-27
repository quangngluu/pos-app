"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/pos";

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ Check session once, but NEVER get stuck
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;

        if (error) {
          console.warn("getSession error:", error.message);
          return;
        }

        if (data.session) {
          router.replace(redirect);
        }
      } catch (e) {
        console.warn("getSession threw:", e);
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      if (data.session) {
        router.replace(redirect);
        return;
      }

      // fallback (hiếm)
      router.replace(redirect);
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Login</h1>

      {checking ? (
        <div style={{ opacity: 0.8 }}>Checking session...</div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ marginBottom: 6, opacity: 0.8 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
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

          {err && (
            <div style={{ color: "#fca5a5", border: "1px solid rgba(239,68,68,0.4)", padding: 10, borderRadius: 8 }}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: submitting ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.25)",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
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
