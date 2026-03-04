"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";

export function Navigation() {
    const pathname = usePathname();

    const navItems = [
        { label: "POS", href: "/pos" },
        { label: "Orders", href: "/orders" },
    ];

    return (
        <header
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${spacing['12']} ${spacing['24']}`,
                background: colors.bg.primary,
                borderBottom: `1px solid ${colors.border.light}`,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: spacing['24'] }}>
                {/* Brand / Store Logo */}
                <div style={{ display: "flex", alignItems: "center", gap: spacing['8'] }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: borderRadius.md,
                            background: colors.interactive.primary,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: colors.text.inverse,
                            fontWeight: typography.fontWeight.bold,
                            fontSize: typography.fontSize.lg,
                        }}
                    >
                        P
                    </div>
                    <span style={{ fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.lg, color: colors.text.primary }}>
                        POSWeb
                    </span>
                </div>

                {/* Navigation Links */}
                <nav style={{ display: "flex", gap: spacing['8'] }}>
                    {navItems.map((item) => {
                        const isActive = pathname?.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    padding: `${spacing['6']} ${spacing['12']}`,
                                    borderRadius: borderRadius.md,
                                    background: isActive ? colors.bg.secondary : "transparent",
                                    color: isActive ? colors.text.primary : colors.text.secondary,
                                    fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.medium,
                                    fontSize: typography.fontSize.sm,
                                    textDecoration: "none",
                                    transition: "all 0.15s ease",
                                }}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Secondary Info (e.g., User/Store) */}
            <div style={{ display: "flex", alignItems: "center", gap: spacing['16'] }}>
                <div style={{ display: "flex", alignItems: "center", gap: spacing['8'], color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.status.success }}></span>
                    <span>Phê La Hồ Tùng Mậu</span>
                </div>
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: borderRadius.full,
                        background: colors.bg.tertiary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: colors.text.primary,
                        fontWeight: typography.fontWeight.semibold,
                        fontSize: typography.fontSize.sm,
                        border: `1px solid ${colors.border.light}`,
                    }}
                    title="Admin Staff"
                >
                    A
                </div>
            </div>
        </header>
    );
}
