"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  Badge,
  Button,
  Card,
} from "@/app/components";
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

type Order = {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  total: number;
  created_at: string;
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const label = STATUS_LABELS[status] ?? status;
  const variant = STATUS_VARIANTS[status] ?? "info";
  return <Badge variant={variant}>{label}</Badge>;
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      params.set("limit", "50");

      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 401) {
          setError("Vui lòng đăng nhập để xem đơn hàng");
        } else {
          setError(json.error || "Không thể tải đơn hàng");
        }
        return;
      }

      setOrders(json.orders || []);
    } catch (e) {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  // Quick status update from list
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
        // Update local state - match by id or order_code
        setOrders(prev => prev.map(o => 
          (o.order_code === orderIdentifier || o.id === orderIdentifier) 
            ? { ...o, status: newStatus } 
            : o
        ));
      }
    } catch (e) {
      console.error("Quick update failed:", e);
    } finally {
      setUpdatingOrder(null);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: spacing['24'] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing['24'] }}>
        <div>
          <h1 style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.semibold, marginBottom: spacing['4'] }}>Đơn hàng của tôi</h1>
          {!loading && !error && (
            <span style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>
              {orders.length} đơn hàng{statusFilter && ` • ${STATUS_LABELS[statusFilter]}`}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: spacing['8'] }}>
          <Button 
            variant="secondary" 
            onClick={() => fetchOrders()}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "Tải lại"}
          </Button>
          <Link href="/pos">
            <Button variant="secondary">Quay lại POS</Button>
          </Link>
        </div>
      </div>

      {/* Status filter */}
      <div style={{ marginBottom: spacing['16'], display: "flex", gap: spacing['8'], flexWrap: "wrap" }}>
        <button
          onClick={() => setStatusFilter("")}
          style={{
            padding: `${spacing['6']} ${spacing['12']}`,
            borderRadius: borderRadius.full,
            border: statusFilter === "" ? `1px solid ${colors.interactive.primary}` : `1px solid ${colors.border.light}`,
            background: statusFilter === "" ? colors.status.infoLight : colors.bg.primary,
            color: statusFilter === "" ? colors.interactive.primaryHover : colors.text.primary,
            cursor: "pointer",
            fontSize: typography.fontSize.sm,
            display: "flex",
            alignItems: "center",
            gap: spacing['6'],
            fontWeight: typography.fontWeight.medium,
          }}
        >
          Tất cả
        </button>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: `${spacing['4']} ${spacing['6']}`,
              borderRadius: borderRadius.full,
              border: statusFilter === s ? `1px solid ${colors.interactive.primary}` : `1px solid ${colors.border.light}`,
              background: statusFilter === s ? colors.status.infoLight : colors.bg.primary,
              cursor: "pointer",
              fontSize: typography.fontSize.sm,
              display: "flex",
              alignItems: "center",
              gap: spacing['6'],
            }}
          >
            <StatusBadge status={s} />
          </button>
        ))}
      </div>

      {loading && <p style={{ color: colors.text.secondary }}>Đang tải đơn hàng...</p>}

      {error && (
        <Card style={{ padding: spacing['16'], background: colors.status.errorLight, color: colors.status.error }}>
          Lỗi: {error}
          {error.includes("đăng nhập") && (
            <div style={{ marginTop: spacing['8'] }}>
              <Link href="/login" style={{ color: colors.interactive.primary, textDecoration: "underline" }}>
                Đăng nhập
              </Link>
            </div>
          )}
        </Card>
      )}

      {!loading && !error && orders.length === 0 && (
        <Card style={{ textAlign: "center", padding: spacing['32'] }}>
          <p style={{ color: colors.text.secondary, marginBottom: spacing['16'] }}>Không có đơn hàng nào.</p>
          <Button variant="secondary" onClick={() => fetchOrders()}>
            Tải lại
          </Button>
        </Card>
      )}

      {!loading && !error && orders.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Mã đơn</TableHeader>
              <TableHeader>Trạng thái</TableHeader>
              <TableHeader style={{ textAlign: "right", paddingRight: 24 }}>Tổng tiền</TableHeader>
              <TableHeader>Ngày tạo</TableHeader>
              <TableHeader style={{ textAlign: "center" }}>Thao tác</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody striped>
            {orders.map((order) => {
              // Get status - ensure uppercase for matching with VALID_TRANSITIONS
              const rawStatus = order.status || "PLACED";
              const normalizedStatus = rawStatus.toUpperCase() as OrderStatus;
              const transitions = VALID_TRANSITIONS[normalizedStatus] ?? [];
              const nextStatuses = transitions.filter(s => s !== "CANCELLED");
              const canCancel = transitions.includes("CANCELLED");
              const isUpdating = updatingOrder === order.id;
              // Use order_code if available, otherwise use id
              const orderIdentifier = order.order_code || order.id;
              const displayCode = order.order_code || order.id.slice(0, 8);
              
              return (
                <TableRow key={order.id}>
                  <TableCell style={{ fontFamily: typography.fontFamily.mono }}>
                    <Link href={`/orders/${orderIdentifier}`} style={{ color: colors.interactive.primary, textDecoration: "underline" }}>
                      {displayCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={normalizedStatus} />
                  </TableCell>
                  <TableCell style={{ textAlign: "right", fontFamily: typography.fontFamily.mono, paddingRight: spacing['24'] }}>
                    {formatMoney(order.total)}
                  </TableCell>
                  <TableCell style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                    {formatDate(order.created_at)}
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: spacing['6'], justifyContent: "center", flexWrap: "nowrap" }}>
                      {nextStatuses.length > 0 ? (
                        <button
                          onClick={() => quickUpdateStatus(orderIdentifier, nextStatuses[0])}
                          disabled={isUpdating}
                          style={{
                            padding: `${spacing['4']} ${spacing['12']}`,
                            fontSize: typography.fontSize.xs,
                            fontWeight: typography.fontWeight.medium,
                            background: colors.status.infoLight,
                            color: colors.interactive.primaryHover,
                            border: `1px solid ${colors.interactive.primary}`,
                            borderRadius: borderRadius.sm,
                            cursor: isUpdating ? "wait" : "pointer",
                            opacity: isUpdating ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isUpdating ? "..." : STATUS_LABELS[nextStatuses[0]]}
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          onClick={() => {
                            if (confirm("Bạn có chắc muốn huỷ đơn hàng này?")) {
                              quickUpdateStatus(orderIdentifier, "CANCELLED");
                            }
                          }}
                          disabled={isUpdating}
                          style={{
                            padding: `${spacing['4']} ${spacing['12']}`,
                            fontSize: typography.fontSize.xs,
                            fontWeight: typography.fontWeight.medium,
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
                      ) : null}
                      {nextStatuses.length === 0 && !canCancel ? (
                        <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>—</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
