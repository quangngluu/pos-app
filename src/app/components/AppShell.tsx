"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED } from "./Sidebar";
import { supabase } from "@/app/lib/supabaseClient";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";

/**
 * AppShell — layout wrapper: collapsible sidebar + top header + main content.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState(false);

    const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session?.user?.email) {
                setUserEmail(data.session.user.email);
            }
        })();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    const initials = userEmail
        ? userEmail.charAt(0).toUpperCase()
        : "?";

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <div style={{
                marginLeft: sidebarWidth,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                transition: "margin-left 0.2s ease",
            }}>
                {/* Top Header */}
                <header style={{
                    height: 48,
                    background: colors.bg.primary,
                    borderBottom: `1px solid ${colors.border.light}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    padding: "0 20px",
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                }}>
                    {/* Account */}
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px 8px",
                                borderRadius: borderRadius.md,
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.tertiary; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#6b4c2a",
                                color: "#faf6f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 600,
                            }}>
                                {initials}
                            </div>
                            {userEmail && (
                                <span style={{
                                    fontSize: 13,
                                    color: colors.text.secondary,
                                    maxWidth: 160,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {userEmail}
                                </span>
                            )}
                            <span style={{ fontSize: 10, color: colors.text.tertiary }}>▼</span>
                        </button>

                        {/* Dropdown */}
                        {showMenu && (
                            <>
                                <div
                                    style={{ position: "fixed", inset: 0, zIndex: 60 }}
                                    onClick={() => setShowMenu(false)}
                                />
                                <div style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "calc(100% + 4px)",
                                    background: colors.bg.primary,
                                    border: `1px solid ${colors.border.light}`,
                                    borderRadius: borderRadius.md,
                                    boxShadow: "0 4px 12px rgba(44,36,24,0.12)",
                                    minWidth: 160,
                                    zIndex: 70,
                                    overflow: "hidden",
                                }}>
                                    <button
                                        onClick={handleLogout}
                                        style={{
                                            display: "block",
                                            width: "100%",
                                            padding: "10px 16px",
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            color: colors.text.primary,
                                            textAlign: "left",
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.secondary; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                    >
                                        Đăng xuất
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </header>

                {/* Main content */}
                <main style={{ flex: 1 }}>
                    {children}
                </main>
            </div>
        </div>
    );
}
