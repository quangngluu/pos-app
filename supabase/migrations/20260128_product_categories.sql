-- Migration: Add product_categories master table
-- Purpose: Centralize category management for products

-- Create product_categories table
CREATE TABLE IF NOT EXISTS public.product_categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_active ON public.product_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_product_categories_sort ON public.product_categories(sort_order);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_product_categories_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_product_categories_timestamp
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_product_categories_timestamp();

-- RLS policies
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_categories_select_policy" ON public.product_categories
  FOR SELECT USING (true);

CREATE POLICY "product_categories_insert_policy" ON public.product_categories
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "product_categories_update_policy" ON public.product_categories
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Seed initial categories from existing products
INSERT INTO public.product_categories (code, name, sort_order, is_active)
SELECT DISTINCT 
  UPPER(TRIM(category)) as code,
  CASE 
    WHEN UPPER(TRIM(category)) IN ('DRINK', 'DRK', 'DO_UONG') THEN 'Đồ uống'
    WHEN UPPER(TRIM(category)) IN ('CAKE', 'BANH') THEN 'Bánh'
    WHEN UPPER(TRIM(category)) IN ('TOPPING', 'TOP') THEN 'Topping'
    WHEN UPPER(TRIM(category)) IN ('MERCHANDISE', 'MERCH', 'MER') THEN 'Hàng hóa'
    WHEN UPPER(TRIM(category)) = 'PCTC' THEN 'Phụ kiện'
    ELSE INITCAP(TRIM(category))
  END as name,
  CASE 
    WHEN UPPER(TRIM(category)) IN ('DRINK', 'DRK', 'DO_UONG') THEN 1
    WHEN UPPER(TRIM(category)) IN ('CAKE', 'BANH') THEN 2
    WHEN UPPER(TRIM(category)) IN ('TOPPING', 'TOP') THEN 3
    WHEN UPPER(TRIM(category)) IN ('MERCHANDISE', 'MERCH', 'MER') THEN 4
    WHEN UPPER(TRIM(category)) = 'PCTC' THEN 5
    ELSE 99
  END as sort_order,
  true as is_active
FROM public.products
WHERE category IS NOT NULL AND TRIM(category) != ''
ON CONFLICT (code) DO NOTHING;

-- Normalize existing product categories to match master
UPDATE public.products 
SET category = 'DRINK' 
WHERE UPPER(TRIM(category)) IN ('DRK', 'DO_UONG');

UPDATE public.products 
SET category = 'CAKE' 
WHERE UPPER(TRIM(category)) = 'BANH';

UPDATE public.products 
SET category = 'TOPPING' 
WHERE UPPER(TRIM(category)) = 'TOP';

UPDATE public.products 
SET category = 'MERCHANDISE' 
WHERE UPPER(TRIM(category)) IN ('MERCH', 'MER');

COMMENT ON TABLE public.product_categories IS 'Master category list for products';
