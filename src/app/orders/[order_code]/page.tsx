"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

function formatMoney(n: number): string {
  return Math.round(n || 0).toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN");
}

type OrderImage = {
  file_id?: string;
  file_url?: string;
  uploaded_at?: string;
  source?: string;
};

type OrderCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
};

type OrderLine = {
  product_id: string | null;
  product_name_snapshot: string | null;
  price_key_snapshot: string | null;
  unit_price_snapshot: number | null;
  qty: number | null;
  options_snapshot?: any;
  line_total: number | null;
  note?: string | null;
};

type OrderDetail = {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  total: number;
  subtotal: number | null;
  discount_total: number | null;
  created_at: string;
  lines: OrderLine[];
  images: OrderImage[];
  note: string | null;
  address: string | null;
  customer: OrderCustomer | null;
};

export default function OrderDetailPage() {
  const params = useParams<{ order_code: string }>();
  const orderCode = params?.order_code;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  async function fetchDetail() {
    if (!orderCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderCode}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || "Không tìm thấy đơn hàng");
        return;
      }
      setOrder(json.order);
    } catch (e) {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();
  }, [orderCode]);

  async function updateStatus(newStatus: OrderStatus) {
    if (!orderCode || !order) return;
    
    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);
    
    try {
      const res = await fetch(`/api/orders/${orderCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      
      if (!res.ok || !json.ok) {
        if (res.status === 404) {
          setUpdateError("Không tìm thấy đơn hàng hoặc bạn không có quyền cập nhật");
        } else if (json.error === "Invalid status transition") {
          setUpdateError(`Không thể chuyển từ "${STATUS_LABELS[order.status]}" sang "${STATUS_LABELS[newStatus]}"`);
        } else {
          setUpdateError(json.error || "Không thể cập nhật trạng thái");
        }
        return;
      }
      
      // Update local state
      setOrder(prev => prev ? { ...prev, status: newStatus } : null);
      setUpdateSuccess(`Đã cập nhật thành "${STATUS_LABELS[newStatus]}"`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setUpdateSuccess(null), 3000);
    } catch (e) {
      setUpdateError("Lỗi kết nối");
    } finally {
      setUpdating(false);
    }
  }

  // Get available next statuses for current order
  const availableTransitions = order ? VALID_TRANSITIONS[order.status] : [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: spacing['24'] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing['16'] }}>
        <div>
          <h1 style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, marginBottom: spacing['8'] }}>
            Đơn #{order?.order_code || orderCode}
          </h1>
          {order && (
            <Badge variant={STATUS_VARIANTS[order.status] || "info"}>
              {STATUS_LABELS[order.status] || order.status}
            </Badge>
          )}
        </div>
        <Link href="/orders">
          <Button variant="secondary">← Quay lại danh sách</Button>
        </Link>
      </div>

      {loading && <p style={{ color: colors.text.secondary }}>Đang tải chi tiết đơn hàng...</p>}

      {error && (
        <Card style={{ padding: spacing['16'], background: colors.status.errorLight, color: colors.status.error }}>
          Lỗi: {error}
        </Card>
      )}

      {!loading && !error && order && (
        <div style={{ display: "grid", gap: spacing['16'], marginTop: spacing['8'] }}>
          {/* Status Update Section */}
          {availableTransitions.length > 0 && (
            <Card style={{ 
              padding: spacing['16'], 
              background: colors.bg.secondary,
            }}>
              <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['12'], color: colors.text.secondary }}>
                Cập nhật trạng thái
              </div>
              <div style={{ display: "flex", gap: spacing['8'], flexWrap: "wrap" }}>
                {availableTransitions.map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    variant={nextStatus === "CANCELLED" ? "secondary" : "primary"}
                    onClick={() => updateStatus(nextStatus)}
                    disabled={updating}
                    style={{
                      opacity: updating ? 0.6 : 1,
                      cursor: updating ? "wait" : "pointer",
                      ...(nextStatus === "CANCELLED" ? { 
                        background: colors.status.errorLight, 
                        color: colors.status.error,
                        border: `1px solid ${colors.status.error}`
                      } : {}),
                    }}
                  >
                    {updating ? "Đang xử lý..." : `→ ${STATUS_LABELS[nextStatus]}`}
                  </Button>
                ))}
              </div>
              
              {updateError && (
                <div style={{ 
                  marginTop: spacing['12'], 
                  padding: spacing['10'], 
                  background: colors.status.errorLight, 
                  borderRadius: borderRadius.base, 
                  color: colors.status.error,
                  fontSize: typography.fontSize.sm 
                }}>
                  {updateError}
                </div>
              )}
              
              {updateSuccess && (
                <div style={{ 
                  marginTop: spacing['12'], 
                  padding: spacing['10'], 
                  background: colors.status.successLight, 
                  borderRadius: borderRadius.base, 
                  color: colors.status.success,
                  fontSize: typography.fontSize.sm 
                }}>
                  {updateSuccess}
                </div>
              )}
            </Card>
          )}

          {/* Terminal status message */}
          {availableTransitions.length === 0 && order.status !== "PLACED" && (
            <Card style={{ 
              padding: spacing['12'], 
              background: order.status === "COMPLETED" ? colors.status.successLight : colors.status.errorLight,
              color: order.status === "COMPLETED" ? colors.status.success : colors.status.error,
              fontSize: typography.fontSize.sm
            }}>
              {order.status === "COMPLETED" 
                ? "Đơn hàng đã hoàn thành" 
                : "Đơn hàng đã bị huỷ"}
            </Card>
          )}

          {/* Customer Info */}
          {order.customer && (
            <Card style={{ 
              padding: spacing['16'], 
              background: colors.bg.secondary,
            }}>
              <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['8'], color: colors.text.secondary }}>
                Khách hàng
              </div>
              <div style={{ display: "flex", gap: spacing['24'], flexWrap: "wrap" }}>
                {order.customer.name && (
                  <div>
                    <span style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Tên: </span>
                    <span style={{ fontWeight: typography.fontWeight.medium }}>{order.customer.name}</span>
                  </div>
                )}
                {order.customer.phone && (
                  <div>
                    <span style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>SĐT: </span>
                    <span style={{ fontWeight: typography.fontWeight.medium, fontFamily: typography.fontFamily.mono }}>{order.customer.phone}</span>
                  </div>
                )}
              </div>
              {order.address && (
                <div style={{ marginTop: spacing['8'] }}>
                  <span style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Địa chỉ: </span>
                  <span>{order.address}</span>
                </div>
              )}
            </Card>
          )}

          <div style={{ display: "flex", gap: spacing['16'], flexWrap: "wrap" }}>
            <div style={{ minWidth: 180 }}>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Tổng tiền</div>
              <div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold }}>{formatMoney(order.total)}</div>
            </div>
            <div style={{ minWidth: 180 }}>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Ngày tạo</div>
              <div style={{ fontSize: typography.fontSize.base }}>{formatDate(order.created_at)}</div>
            </div>
            {order.discount_total ? (
              <div style={{ minWidth: 180 }}>
                <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Chiết khấu</div>
                <div style={{ fontSize: typography.fontSize.base }}>- {formatMoney(order.discount_total)}</div>
              </div>
            ) : null}
          </div>

          <div>
            <h2 style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['8'] }}>Món</h2>
            {order.lines.length === 0 ? (
              <p style={{ color: colors.text.secondary }}>Không có dòng sản phẩm.</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Món</TableHeader>
                    <TableHeader style={{ textAlign: "right" }}>SL</TableHeader>
                    <TableHeader style={{ textAlign: "right" }}>Đơn giá</TableHeader>
                    <TableHeader style={{ textAlign: "right" }}>Thành tiền</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody striped>
                  {order.lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div style={{ fontWeight: typography.fontWeight.semibold }}>{line.product_name_snapshot || "(Không tên)"}</div>
                        {line.price_key_snapshot && (
                          <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>Size: {line.price_key_snapshot}</div>
                        )}
                        {line.note && <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>Note: {line.note}</div>}
                      </TableCell>
                      <TableCell style={{ textAlign: "right", fontFamily: typography.fontFamily.mono }}>
                        {line.qty ?? 0}
                      </TableCell>
                      <TableCell style={{ textAlign: "right", fontFamily: typography.fontFamily.mono }}>
                        {formatMoney(line.unit_price_snapshot ?? 0)}
                      </TableCell>
                      <TableCell style={{ textAlign: "right", fontFamily: typography.fontFamily.mono }}>
                        {formatMoney(line.line_total ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Order Note */}
          {order.note && (
            <Card style={{ 
              padding: spacing['12'], 
              background: colors.status.warningLight,
            }}>
              <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.status.warning, marginBottom: spacing['4'] }}>
                Ghi chú
              </div>
              <div style={{ color: colors.text.primary }}>{order.note}</div>
            </Card>
          )}

          {/* Images Section */}
          {order.images && order.images.length > 0 && (
            <div>
              <h2 style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, marginBottom: spacing['8'] }}>Hình ảnh ({order.images.length})</h2>
              <div style={{ display: "flex", gap: spacing['12'], flexWrap: "wrap" }}>
                {order.images.map((img, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      width: 120, 
                      height: 120, 
                      borderRadius: borderRadius.md, 
                      overflow: "hidden",
                      border: `1px solid ${colors.border.light}`,
                      background: colors.bg.secondary,
                      position: "relative",
                    }}
                  >
                    {img.file_url ? (
                      <a href={img.file_url} target="_blank" rel="noopener noreferrer">
                        <img 
                          src={img.file_url} 
                          alt={`Order image ${idx + 1}`}
                          style={{ 
                            width: "100%", 
                            height: "100%", 
                            objectFit: "cover" 
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </a>
                    ) : (
                      <div style={{ 
                        width: "100%", 
                        height: "100%", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        color: colors.text.muted,
                        fontSize: typography.fontSize.xs,
                      }}>
                        No preview
                      </div>
                    )}
                    {img.source && (
                      <div style={{
                        position: "absolute",
                        bottom: spacing['4'],
                        right: spacing['4'],
                        background: "rgba(0,0,0,0.6)",
                        color: colors.text.inverse,
                        fontSize: typography.fontSize.xs,
                        padding: `${spacing['2']} ${spacing['6']}`,
                        borderRadius: borderRadius.sm,
                      }}>
                        {img.source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
