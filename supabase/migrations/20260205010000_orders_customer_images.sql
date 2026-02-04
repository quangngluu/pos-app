-- Migration: Add customer requirement and images support to orders
-- Date: 2026-02-05
-- Purpose: 
--   1. Ensure orders have customer_id (for proper order management)
--   2. Add images column to store photo URLs/references

-- Add images column (JSONB array for flexible storage)
-- Format: [{ file_id, file_url, uploaded_at, source }, ...]
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Add order_code column if not exists (short code for easy reference)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_code VARCHAR(20);

-- Create function to generate short order code
CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate 8-character hex code from UUID
  IF NEW.order_code IS NULL THEN
    NEW.order_code := LOWER(SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate order_code
DROP TRIGGER IF EXISTS tr_orders_generate_code ON public.orders;
CREATE TRIGGER tr_orders_generate_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_code();

-- Update existing orders that don't have order_code
UPDATE public.orders 
SET order_code = LOWER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE order_code IS NULL;

-- Add index on order_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_code 
ON public.orders(order_code);

-- Add index on customer_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_id 
ON public.orders(customer_id);

-- Add comment for documentation
COMMENT ON COLUMN public.orders.images IS 'Array of image objects: [{ file_id, file_url, uploaded_at, source }]';
COMMENT ON COLUMN public.orders.order_code IS 'Short human-readable order code (8 hex chars from UUID)';

-- Note: customer_id is NOT set to NOT NULL to maintain backward compatibility
-- The application layer will enforce customer requirement for new orders
