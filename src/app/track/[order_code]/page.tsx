"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Badge, Card, Button } from "@/app/components";
import { STATUS_LABELS, STATUS_VARIANTS, OrderStatus } from "@/app/lib/constants/orderStatus";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";

type TrackOrderData = {
    id: string;
    order_code: string;
    status: OrderStatus;
    total: number;
    created_at: string;
    address: string;
    note: string;
    timestamps: {
        placed_at: string;
        confirmed_at: string | null;
        shipping_at: string | null;
        completed_at: string | null;
    };
    lines: Array<{
        id: string;
        name: string;
        qty: number;
        size: string;
        options: any;
        total: number;
    }>;
};

function formatMoney(n: number): string {
    return n.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
    });
}

// Progress Stepper Component
function OrderProgress({ status, timestamps }: { status: OrderStatus, timestamps: TrackOrderData['timestamps'] }) {
    const steps = [
        { key: "PLACED", label: "Đã đặt hàng", time: timestamps.placed_at },
        { key: "CONFIRMED", label: "Đã xác nhận", time: timestamps.confirmed_at },
        { key: "SHIPPING", label: "Đang giao", time: timestamps.shipping_at },
        { key: "COMPLETED", label: "Hoàn thành", time: timestamps.completed_at },
    ] as const;

    if (status === "CANCELLED") {
        return (
            <div style={{ padding: spacing['16'], background: colors.status.errorLight, color: colors.status.error, borderRadius: borderRadius.md, textAlign: "center", fontWeight: "bold" }}>
                Đơn hàng đã bị hủy
            </div>
        );
    }

    // Find current step index
    const currentIndex = steps.findIndex(s => s.key === status);
    // Unrecognized status fallback
    const activeIndex = currentIndex === -1 ? 0 : currentIndex;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing['16'], margin: `${spacing['24']} 0` }}>
            {steps.map((step, idx) => {
                const isCompleted = idx <= activeIndex;
                const isActive = idx === activeIndex;
                const color = isCompleted ? colors.interactive.primary : colors.border.light;

                return (
                    <div key={step.key} style={{ display: "flex", gap: spacing['12'] }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: "50%",
                                    background: isCompleted ? color : "transparent",
                                    border: `2px solid ${color}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "white",
                                    fontSize: 12
                                }}
                            >
                                {isCompleted && "✓"}
                            </div>
                            {idx < steps.length - 1 && (
                                <div style={{ width: 2, height: 40, background: color, margin: "4px 0" }} />
                            )}
                        </div>
                        <div style={{ flex: 1, paddingBottom: idx < steps.length - 1 ? 0 : spacing['16'] }}>
                            <div style={{
                                fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.medium,
                                color: isCompleted ? colors.text.primary : colors.text.muted
                            }}>
                                {step.label}
                            </div>
                            {step.time && (
                                <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                                    {formatDate(step.time)}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function TrackPage({ params }: { params: Promise<{ order_code: string }> }) {
    const unwrappedParams = use(params);
    const { order_code } = unwrappedParams;

    const [data, setData] = useState<TrackOrderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    async function fetchStatus(isSilent = false) {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);

        setError(null);
        try {
            const res = await fetch(`/api/track/${order_code}`);
            const json = await res.json();

            if (!res.ok || !json.ok) {
                setError(json.error || "Không thể tải thông tin đơn hàng");
            } else {
                setData(json.order);
            }
        } catch (e) {
            setError("Lỗi kết nối mạng");
        } finally {
            if (!isSilent) setLoading(false);
            else setRefreshing(false);
        }
    }

    useEffect(() => {
        fetchStatus();
        // Refresh every 30 seconds
        const interval = setInterval(() => {
            fetchStatus(true);
        }, 30000);
        return () => clearInterval(interval);
    }, [order_code]);

    if (loading) {
        return <div style={{ padding: spacing['32'], textAlign: "center", color: colors.text.secondary }}>Đang tải thông tin đơn hàng...</div>;
    }

    if (error || !data) {
        return (
            <div style={{ maxWidth: 600, margin: "0 auto", padding: spacing['24'] }}>
                <Card style={{ padding: spacing['24'], textAlign: "center", background: colors.status.errorLight }}>
                    <h2 style={{ color: colors.status.error, marginBottom: spacing['12'] }}>Lỗi Tra Cứu</h2>
                    <p style={{ color: colors.text.secondary }}>{error}</p>
                    <Button variant="secondary" onClick={() => fetchStatus()} style={{ marginTop: spacing['16'] }}>
                        Thử lại
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: spacing['24'] }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing['24'] }}>
                <div>
                    <h1 style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, marginBottom: spacing['4'] }}>
                        Đơn #{data.order_code}
                    </h1>
                    <div style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                        Bởi The Coffee POS
                    </div>
                </div>
                <Button
                    variant="secondary"
                    onClick={() => fetchStatus(true)}
                    disabled={refreshing}
                    style={{ fontSize: typography.fontSize.sm, padding: `${spacing['6']} ${spacing['12']}` }}
                >
                    {refreshing ? "Đang làm mới..." : "Làm mới"}
                </Button>
            </div>

            <Card style={{ padding: spacing['24'], marginBottom: spacing['16'] }}>
                <h2 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['16'] }}>
                    Trạng thái đơn hàng
                </h2>
                <OrderProgress status={data.status} timestamps={data.timestamps} />
            </Card>

            <Card style={{ padding: spacing['24'] }}>
                <h2 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['16'] }}>
                    Chi tiết món
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: spacing['12'] }}>
                    {data.lines.map((line) => (
                        <div key={line.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${colors.border.light}`, paddingBottom: spacing['12'] }}>
                            <div>
                                <div style={{ fontWeight: typography.fontWeight.medium }}>
                                    <span style={{ color: colors.interactive.primary }}>{line.qty}x</span> {line.name}
                                </div>
                                <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                                    Size {line.size.replace("SIZE_", "")}
                                    {line.options?.sugar_value_code && `, ${line.options.sugar_value_code}% đường`}
                                </div>
                            </div>
                            <div style={{ fontWeight: typography.fontWeight.medium, fontFamily: typography.fontFamily.mono }}>
                                {formatMoney(line.total)}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: spacing['16'], paddingTop: spacing['16'], borderTop: `1px dashed ${colors.border.default}` }}>
                    <div style={{ fontWeight: typography.fontWeight.bold }}>Tổng cộng</div>
                    <div style={{ fontWeight: typography.fontWeight.bold, fontFamily: typography.fontFamily.mono, color: colors.interactive.primary }}>
                        {formatMoney(data.total)}
                    </div>
                </div>

                {data.address && (
                    <div style={{ marginTop: spacing['24'], padding: spacing['12'], background: colors.bg.secondary, borderRadius: borderRadius.md }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, textTransform: "uppercase", marginBottom: 4 }}>Giao đến</div>
                        <div style={{ fontSize: typography.fontSize.sm, lineHeight: 1.5 }}>{data.address}</div>
                    </div>
                )}

            </Card>

        </div>
    );
}
