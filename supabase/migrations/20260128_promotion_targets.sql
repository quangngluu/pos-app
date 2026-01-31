-- Migration: Add promotion_targets table for PRODUCT-level scopes
-- This table allows promotions to target specific products (e.g., specific DRINK items)
-- Used in conjunction with promotion_scopes (CATEGORY-level scoping)

-- Create promotion_targets table
CREATE TABLE IF NOT EXISTS public.promotion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code TEXT NOT NULL REFERENCES public.promotions(code) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique constraint: one row per promotion+product
  CONSTRAINT promotion_targets_unique UNIQUE (promotion_code, product_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_promotion_targets_code ON public.promotion_targets(promotion_code);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_product ON public.promotion_targets(product_id);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_enabled ON public.promotion_targets(promotion_code, is_enabled);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_promotion_targets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_promotion_targets_timestamp
  BEFORE UPDATE ON public.promotion_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_promotion_targets_timestamp();

-- Add RLS policies (admin-only write, public read)
ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;

-- Public can read active targets
CREATE POLICY "promotion_targets_select_policy" ON public.promotion_targets
  FOR SELECT USING (true);

-- Only authenticated admin users can modify
CREATE POLICY "promotion_targets_insert_policy" ON public.promotion_targets
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "promotion_targets_update_policy" ON public.promotion_targets
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "promotion_targets_delete_policy" ON public.promotion_targets
  FOR DELETE USING (auth.role() = 'authenticated');

-- Add comment
COMMENT ON TABLE public.promotion_targets IS 'Product-level targeting for promotions. is_enabled=true acts as include list for PRODUCT scope.';
