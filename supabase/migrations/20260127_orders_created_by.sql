-- Migration: Add created_by tracking to orders table
-- Date: 2026-01-27
-- Purpose: Track which authenticated user created each order

-- Add created_by column (references auth.users)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add index for performance when querying by creator
CREATE INDEX IF NOT EXISTS idx_orders_created_by 
ON public.orders(created_by);

-- Add comment for documentation
COMMENT ON COLUMN public.orders.created_by IS 'User ID (from auth.users) who created this order via POS';

-- Grant necessary permissions (adjust as needed for your RLS policies)
-- If you have RLS enabled, you may need to update policies to allow
-- authenticated users to insert with their own user ID

-- Example RLS policy (uncomment and adjust if needed):
-- DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
-- CREATE POLICY "Users can create orders" ON public.orders
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (created_by = auth.uid());

-- Example RLS policy for reading:
-- DROP POLICY IF EXISTS "Users can read all orders" ON public.orders;
-- CREATE POLICY "Users can read all orders" ON public.orders
--   FOR SELECT
--   TO authenticated
--   USING (true);
