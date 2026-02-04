export const ORDER_STATUSES = ["PLACED", "CONFIRMED", "SHIPPING", "COMPLETED", "CANCELLED"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** UI-friendly labels (no emojis) */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  SHIPPING: "Đang giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

/** Badge variants for UI styling */
export const STATUS_VARIANTS: Record<OrderStatus, "info" | "warning" | "active" | "success" | "error"> = {
  PLACED: "info",
  CONFIRMED: "warning",
  SHIPPING: "active",
  COMPLETED: "success",
  CANCELLED: "error",
};

/** Telegram-specific labels with emojis */
export const TELEGRAM_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "📤 Chờ xác nhận",
  CONFIRMED: "✅ Đã xác nhận",
  SHIPPING: "🚚 Đang giao",
  COMPLETED: "🎉 Hoàn thành",
  CANCELLED: "❌ Đã huỷ",
};

/** Valid status transitions (forward-only for normal flow, CANCELLED from any state) */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPING", "CANCELLED"],
  SHIPPING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
