"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import {
  ORDER_STATUSES,
  OrderStatus,
  STATUS_LABELS,
  STATUS_VARIANTS,
  VALID_TRANSITIONS,
} from "@/app/lib/constants/orderStatus";
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "@/app/lib/designTokens";

/* ============================================================
   Shared styles — aligned with admin design system
============================================================ */

const sharedStyles = {
  input: {
    padding: `${spacing["8"]} ${spacing["12"]}`,
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  } as React.CSSProperties,
  tableHeader: {
    padding: spacing["12"],
    textAlign: "left" as const,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
    borderBottom: `1px solid ${colors.border.light}`,
    background: colors.bg.secondary,
  },
  tableRow: {
    borderBottom: `1px solid ${colors.border.light}`,
  },
  primaryButton: {
    padding: `${spacing["8"]} ${spacing["16"]}`,
    background: colors.interactive.primary,
    border: `1px solid ${colors.interactive.primary}`,
    borderRadius: borderRadius.md,
    color: colors.text.inverse,
    cursor: "pointer",
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  } as React.CSSProperties,
  secondaryButton: {
    padding: `${spacing["8"]} ${spacing["16"]}`,
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.md,
    color: colors.text.primary,
    cursor: "pointer",
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
  } as React.CSSProperties,
};

/* ============================================================
   Types & Helpers
============================================================ */

type Order = {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  total: number;
  created_at: string;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PLACED: { bg: "#dbeafe", color: "#2563eb" },
  CONFIRMED: { bg: "#e0e7ff", color: "#4f46e5" },
  PREPARING: { bg: "#fef3c7", color: "#d97706" },
  READY: { bg: "#d1fae5", color: "#059669" },
  DELIVERING: { bg: "#fce7f3", color: "#db2777" },
  DELIVERED: { bg: "#d1fae5", color: "#047857" },
  COMPLETED: { bg: "#d1fae5", color: "#047857" },
  CANCELLED: { bg: "#fee2e2", color: "#dc2626" },
};

function StatusChip({ status }: { status: OrderStatus }) {
  const label = STATUS_LABELS[status] ?? status;
  const c = STATUS_COLORS[status] ?? { bg: colors.bg.secondary, color: colors.text.secondary };
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: borderRadius.sm,
      fontSize: 12,
      fontWeight: 500,
      background: c.bg,
      color: c.color,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function formatMoney(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ============================================================
   Filter Chip — matches admin design system
============================================================ */

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: `${spacing["6"]} ${spacing["14"]}`,
        borderRadius: borderRadius.md,
        border: active
          ? `1px solid ${colors.interactive.primary}`
          : `1px solid ${colors.border.light}`,
        background: active ? colors.status.infoLight : colors.bg.primary,
        color: active ? colors.interactive.primary : colors.text.primary,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.15s ease",
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: 11,
          background: active ? colors.interactive.primary : colors.bg.tertiary,
          color: active ? "#fff" : colors.text.secondary,
          borderRadius: 10,
          padding: "1px 7px",
          minWidth: 18,
          textAlign: "center",
          fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ============================================================
   Orders Page
============================================================ */

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">(
    ""
  );
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");

      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 401) setError("Vui lòng đăng nhập để xem đơn hàng");
        else setError(json.error || "Không thể tải đơn hàng");
        return;
      }
      setOrders(json.orders || []);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  async function quickUpdateStatus(orderIdentifier: string, newStatus: OrderStatus) {
    setUpdatingOrder(orderIdentifier);
    try {
      const res = await fetch(`/api/orders/${orderIdentifier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            o.order_code === orderIdentifier || o.id === orderIdentifier
              ? { ...o, status: newStatus }
              : o
          )
        );
      }
    } catch (e) {
      console.error("Quick update failed:", e);
    } finally {
      setUpdatingOrder(null);
    }
  }

  return (
    <AppShell>
      <div style={{ padding: spacing["24"], maxWidth: 1200 }}>
        {/* Header — matches admin page pattern */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing["20"] }}>
          <div>
            <h1 style={{ fontSize: typography.fontSize["2xl"], fontWeight: typography.fontWeight.bold, margin: 0, color: colors.text.primary }}>
              Orders
            </h1>
            {!loading && !error && (
              <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, marginTop: 2, display: "block" }}>
                {orders.length} đơn hàng{statusFilter && ` · ${STATUS_LABELS[statusFilter]}`}
              </span>
            )}
          </div>
          <button
            onClick={() => fetchOrders()}
            disabled={loading}
            style={{ ...sharedStyles.secondaryButton, opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Đang tải..." : "Tải lại"}
          </button>
        </div>

        {/* Status filter chips — clean, rounded-md, no pill shape */}
        <div style={{ display: "flex", gap: 8, marginBottom: spacing["16"], flexWrap: "wrap" }}>
          <FilterChip label="Tất cả" active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          {ORDER_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={STATUS_LABELS[s]}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: spacing["12"],
            marginBottom: spacing["16"],
            background: colors.status.errorLight,
            border: `1px solid ${colors.status.error}`,
            borderRadius: borderRadius.base,
            color: colors.status.error,
            fontSize: typography.fontSize.sm,
          }}>
            Lỗi: {error}
            {error.includes("đăng nhập") && (
              <Link href="/login" style={{ color: colors.interactive.primary, textDecoration: "underline", marginLeft: 8 }}>
                Đăng nhập
              </Link>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: spacing["24"], textAlign: "center", color: colors.text.secondary }}>
            Đang tải đơn hàng...
          </div>
        )}

        {/* Empty */}
        {!loading && !error && orders.length === 0 && (
          <div style={{ padding: spacing["24"], textAlign: "center", color: colors.text.secondary }}>
            Không có đơn hàng nào.
          </div>
        )}

        {/* Table — uses same raw table pattern as admin tabs */}
        {!loading && !error && orders.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                  <th style={sharedStyles.tableHeader}>Mã đơn</th>
                  <th style={sharedStyles.tableHeader}>Trạng thái</th>
                  <th style={{ ...sharedStyles.tableHeader, textAlign: "right" }}>Tổng tiền</th>
                  <th style={sharedStyles.tableHeader}>Ngày tạo</th>
                  <th style={{ ...sharedStyles.tableHeader, textAlign: "center" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const rawStatus = order.status || "PLACED";
                  const normalizedStatus = rawStatus.toUpperCase() as OrderStatus;
                  const transitions = VALID_TRANSITIONS[normalizedStatus] ?? [];
                  const nextStatuses = transitions.filter((s) => s !== "CANCELLED");
                  const canCancel = transitions.includes("CANCELLED");
                  const isUpdating = updatingOrder === order.id;
                  const orderIdentifier = order.order_code || order.id;
                  const displayCode = order.order_code || order.id.slice(0, 8);

                  return (
                    <tr key={order.id} style={sharedStyles.tableRow}>
                      <td style={{ padding: spacing["12"], fontFamily: typography.fontFamily.mono }}>
                        <Link
                          href={`/orders/${orderIdentifier}`}
                          style={{ color: colors.interactive.primary, textDecoration: "none", fontWeight: 500 }}
                        >
                          {displayCode}
                        </Link>
                      </td>
                      <td style={{ padding: spacing["12"] }}>
                        <StatusChip status={normalizedStatus} />
                      </td>
                      <td style={{ padding: spacing["12"], textAlign: "right", fontFamily: typography.fontFamily.mono }}>
                        {formatMoney(order.total)}
                      </td>
                      <td style={{ padding: spacing["12"], color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td style={{ padding: spacing["12"] }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          {nextStatuses.length > 0 && (
                            <button
                              onClick={() => quickUpdateStatus(orderIdentifier, nextStatuses[0])}
                              disabled={isUpdating}
                              style={{
                                padding: "3px 10px",
                                fontSize: 12,
                                fontWeight: 500,
                                background: colors.status.infoLight,
                                color: colors.interactive.primary,
                                border: `1px solid ${colors.interactive.primary}`,
                                borderRadius: borderRadius.sm,
                                cursor: isUpdating ? "wait" : "pointer",
                                opacity: isUpdating ? 0.6 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isUpdating ? "..." : STATUS_LABELS[nextStatuses[0]]}
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => {
                                if (confirm("Bạn có chắc muốn huỷ đơn hàng này?")) {
                                  quickUpdateStatus(orderIdentifier, "CANCELLED");
                                }
                              }}
                              disabled={isUpdating}
                              style={{
                                padding: "3px 10px",
                                fontSize: 12,
                                fontWeight: 500,
                                background: colors.status.errorLight,
                                color: colors.status.error,
                                border: `1px solid ${colors.status.error}`,
                                borderRadius: borderRadius.sm,
                                cursor: isUpdating ? "wait" : "pointer",
                                opacity: isUpdating ? 0.6 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Huỷ
                            </button>
                          )}
                          {nextStatuses.length === 0 && !canCancel && (
                            <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
