-- Migration: Add order status tracking
-- Date: 2026-01-31
-- Purpose: Track order status with timestamps for alerts

-- Create enum type for order status
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'PLACED',      -- Đã bắn đơn
    'CONFIRMED',   -- Cơ sở xác nhận/bấm bill
    'SHIPPING',    -- Đang vận chuyển
    'COMPLETED'    -- Hoàn thành
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add status column with default 'PLACED'
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS status order_status DEFAULT 'PLACED';

-- Add timestamp columns for each status change
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS status_placed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_shipping_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_completed_at TIMESTAMPTZ;

-- Add telegram message_id for editing messages later
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;

-- Set status_placed_at for existing orders
UPDATE public.orders 
SET status_placed_at = created_at 
WHERE status_placed_at IS NULL;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_status_placed_at ON public.orders(status_placed_at);

-- Add comments
COMMENT ON COLUMN public.orders.status IS 'Order status: PLACED, CONFIRMED, SHIPPING, COMPLETED';
COMMENT ON COLUMN public.orders.status_placed_at IS 'Timestamp when order was placed (sent to Telegram)';
COMMENT ON COLUMN public.orders.status_confirmed_at IS 'Timestamp when store confirmed/printed bill';
COMMENT ON COLUMN public.orders.status_shipping_at IS 'Timestamp when order started shipping';
COMMENT ON COLUMN public.orders.status_completed_at IS 'Timestamp when order was completed';
COMMENT ON COLUMN public.orders.telegram_message_id IS 'Telegram message ID for editing status buttons';
