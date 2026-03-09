"use client";

import { useEffect, useRef } from "react";
import { colors, spacing, typography, borderRadius, shadows } from "@/app/lib/designTokens";

/**
 * Drawer — right-side slide-in panel for forms.
 * Renders over content with a backdrop. Width ~520px.
 */
export function Drawer({
    open,
    onClose,
    title,
    subtitle,
    children,
    width = 540,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    width?: number;
}) {
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(15, 23, 42, 0.3)",
                    zIndex: 900,
                    transition: "opacity 0.2s ease",
                }}
            />

            {/* Panel */}
            <div
                ref={panelRef}
                style={{
                    position: "fixed",
                    top: 0, right: 0, bottom: 0,
                    width,
                    maxWidth: "90vw",
                    background: colors.bg.primary,
                    borderLeft: `1px solid ${colors.border.light}`,
                    boxShadow: shadows.xl,
                    zIndex: 901,
                    display: "flex",
                    flexDirection: "column",
                    animation: "slideInRight 0.2s ease",
                }}
            >
                {/* Header */}
                <div style={{
                    padding: `${spacing["16"]} ${spacing["24"]}`,
                    borderBottom: `1px solid ${colors.border.light}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>{title}</h2>
                        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 13, color: colors.text.tertiary }}>{subtitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: colors.bg.secondary,
                            border: `1px solid ${colors.border.light}`,
                            borderRadius: borderRadius.md,
                            width: 32, height: 32,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 16,
                            color: colors.text.secondary,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Body — scrollable */}
                <div style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: spacing["24"],
                }}>
                    {children}
                </div>
            </div>

            {/* Keyframe for slide-in */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
            `}</style>
        </>
    );
}
