"use client";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";

/**
 * Sidebar — collapsible left navigation with Phê La branding.
 */

type NavItem = {
    label: string;
    href: string;
    matchFn?: (pathname: string, params: URLSearchParams) => boolean;
};

type NavGroup = {
    label: string;
    items: NavItem[];
    defaultOpen?: boolean;
};

const NAV: (NavItem | NavGroup)[] = [
    {
        label: "POS",
        href: "/pos",
    },
    {
        label: "Orders",
        href: "/orders",
    },
    {
        label: "Admin",
        defaultOpen: true,
        items: [
            { label: "Stores", href: "/admin?tab=stores", matchFn: (p, sp) => p === "/admin" && (!sp.get("tab") || sp.get("tab") === "stores") },
            { label: "Products", href: "/admin?tab=products", matchFn: (p, sp) => p === "/admin" && sp.get("tab") === "products" },
            { label: "Categories", href: "/admin?tab=categories", matchFn: (p, sp) => p === "/admin" && sp.get("tab") === "categories" },
            { label: "Subcategories", href: "/admin?tab=subcategories", matchFn: (p, sp) => p === "/admin" && sp.get("tab") === "subcategories" },
            { label: "Promotions", href: "/admin?tab=promotions", matchFn: (p, sp) => p === "/admin" && sp.get("tab") === "promotions" },
        ],
    },
];

function isGroup(item: NavItem | NavGroup): item is NavGroup {
    return "items" in item;
}

function isItemActive(item: NavItem, pathname: string, params: URLSearchParams): boolean {
    if (item.matchFn) return item.matchFn(pathname, params);
    return pathname === item.href || pathname.startsWith(item.href + "/");
}

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 56;

function SidebarInner({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
        const defaults = new Set<string>();
        NAV.forEach(n => { if (isGroup(n) && n.defaultOpen) defaults.add(n.label); });
        return defaults;
    });

    const toggleGroup = (label: string) => {
        const next = new Set(openGroups);
        next.has(label) ? next.delete(label) : next.add(label);
        setOpenGroups(next);
    };

    const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

    const linkStyle = (active: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: collapsed ? "10px 0" : "8px 16px 8px 20px",
        justifyContent: collapsed ? "center" : "flex-start",
        fontSize: 14,
        color: active ? "#6b4c2a" : colors.text.primary,
        background: active ? "#f0e6d6" : "transparent",
        borderRadius: borderRadius.md,
        textDecoration: "none",
        fontWeight: active ? 600 : 400,
        margin: collapsed ? "1px 4px" : "1px 8px",
        transition: "all 0.15s ease",
        overflow: "hidden",
        whiteSpace: "nowrap",
    });

    const subLinkStyle = (active: boolean): React.CSSProperties => ({
        ...linkStyle(active),
        paddingLeft: collapsed ? 0 : 36,
        fontSize: 13,
    });

    return (
        <aside style={{
            width,
            minWidth: width,
            height: "100vh",
            background: "#2c2418",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 100,
            overflowY: "auto",
            overflowX: "hidden",
            transition: "width 0.2s ease",
        }}>
            {/* Logo + Collapse toggle */}
            <div style={{
                padding: collapsed ? "14px 0" : "14px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "space-between",
                gap: 10,
            }}>
                <Link href="/pos" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                    <Image src="/logo-phela.png" alt="Phê La" width={28} height={28} style={{ flexShrink: 0 }} />
                    {!collapsed && (
                        <span style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#faf6f0",
                            letterSpacing: "0.04em",
                            whiteSpace: "nowrap",
                        }}>Phê La</span>
                    )}
                </Link>
                <button
                    onClick={onToggle}
                    style={{
                        background: "none",
                        border: "none",
                        color: "rgba(255,255,255,0.5)",
                        cursor: "pointer",
                        padding: 4,
                        fontSize: 16,
                        flexShrink: 0,
                        transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? "▶" : "◀"}
                </button>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, paddingTop: 4 }}>
                {NAV.map((item) => {
                    if (isGroup(item)) {
                        if (collapsed) {
                            // In collapsed mode, just show first letter of group
                            return (
                                <div key={item.label} style={{ textAlign: "center", margin: "8px 0" }}>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.label.charAt(0)}</span>
                                    {item.items.map((sub) => {
                                        const active = isItemActive(sub, pathname, searchParams);
                                        return (
                                            <Link key={sub.label} href={sub.href} style={{
                                                ...subLinkStyle(active),
                                                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                                                color: active ? "#faf6f0" : "rgba(255,255,255,0.6)",
                                            }} title={sub.label}>
                                                <span style={{ fontSize: 12 }}>{sub.label.charAt(0)}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            );
                        }

                        const isOpen = openGroups.has(item.label);
                        const hasActiveChild = item.items.some(i => isItemActive(i, pathname, searchParams));
                        return (
                            <div key={item.label} style={{ marginBottom: 4 }}>
                                <button
                                    onClick={() => toggleGroup(item.label)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        width: "calc(100% - 16px)",
                                        padding: "8px 16px 8px 20px",
                                        margin: "1px 8px",
                                        background: "transparent",
                                        border: "none",
                                        cursor: "pointer",
                                        fontSize: 14,
                                        fontWeight: hasActiveChild ? 600 : 500,
                                        color: hasActiveChild ? "#faf6f0" : "rgba(255,255,255,0.7)",
                                        borderRadius: borderRadius.md,
                                        textAlign: "left",
                                    }}
                                >
                                    {item.label}
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                                </button>
                                {isOpen && (
                                    <div style={{ marginTop: 2 }}>
                                        {item.items.map((sub) => {
                                            const active = isItemActive(sub, pathname, searchParams);
                                            return (
                                                <Link key={sub.label} href={sub.href} style={{
                                                    ...subLinkStyle(active),
                                                    background: active ? "rgba(255,255,255,0.12)" : "transparent",
                                                    color: active ? "#faf6f0" : "rgba(255,255,255,0.6)",
                                                }}>
                                                    {sub.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    } else {
                        const active = isItemActive(item, pathname, searchParams);
                        return (
                            <Link key={item.label} href={item.href} style={{
                                ...linkStyle(active),
                                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                                color: active ? "#faf6f0" : "rgba(255,255,255,0.7)",
                            }} title={collapsed ? item.label : undefined}>
                                {collapsed ? <span style={{ fontSize: 13 }}>{item.label.charAt(0)}</span> : item.label}
                            </Link>
                        );
                    }
                })}
            </nav>
        </aside>
    );
}

export function Sidebar(props: { collapsed: boolean; onToggle: () => void }) {
    return (
        <Suspense fallback={<aside style={{ width: props.collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED, minWidth: props.collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED, height: "100vh", background: "#2c2418", position: "fixed", top: 0, left: 0 }} />}>
            <SidebarInner {...props} />
        </Suspense>
    );
}

export { SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED };
