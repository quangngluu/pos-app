-- Migration: Product Variants Schema with 2-Tier Categories
-- Description: Normalize master data with Base Product + Variant (size) model
-- Date: 2026-01-31

-- =====================================================
-- 1. Create Categories Tables
-- =====================================================

-- Main categories table
CREATE TABLE IF NOT EXISTS public.categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON public.categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);

-- Subcategories (menu sections)
CREATE TABLE IF NOT EXISTS public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code TEXT NOT NULL REFERENCES public.categories(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subcategory_per_category UNIQUE(category_code, name)
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category_code ON public.subcategories(category_code);
CREATE INDEX IF NOT EXISTS idx_subcategories_sort_order ON public.subcategories(sort_order);
CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON public.subcategories(is_active);

-- =====================================================
-- 2. Create Size Key Enum
-- =====================================================

DO $$ BEGIN
  CREATE TYPE public.size_key AS ENUM ('STD', 'SIZE_PHE', 'SIZE_LA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 3. Create Product Variants Tables
-- =====================================================

-- Product variants (SKU level)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_key public.size_key NOT NULL,
  sku_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_size UNIQUE(product_id, size_key)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_code ON public.product_variants(sku_code);
CREATE INDEX IF NOT EXISTS idx_product_variants_size_key ON public.product_variants(size_key);
CREATE INDEX IF NOT EXISTS idx_product_variants_is_active ON public.product_variants(is_active);

-- Product variant prices (price per SKU)
CREATE TABLE IF NOT EXISTS public.product_variant_prices (
  variant_id UUID PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE CASCADE,
  price_vat_incl NUMERIC NOT NULL CHECK (price_vat_incl >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variant_prices_price ON public.product_variant_prices(price_vat_incl);

-- =====================================================
-- 4. Alter Products Table
-- =====================================================

-- Add category relationships to products
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_code TEXT REFERENCES public.categories(code) ON DELETE SET NULL;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category_code ON public.products(category_code);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);

-- =====================================================
-- 5. Create Compatibility View
-- =====================================================

-- View to maintain compatibility with old price_key system
DROP VIEW IF EXISTS public.v_product_prices_compat CASCADE;
CREATE OR REPLACE VIEW public.v_product_prices_compat AS
SELECT 
  pv.product_id,
  CASE 
    WHEN pv.size_key = 'STD' THEN 'PRICE_SMALL'
    WHEN pv.size_key = 'SIZE_PHE' THEN 'PRICE_PHE'
    WHEN pv.size_key = 'SIZE_LA' THEN 'PRICE_LARGE'
  END AS price_key,
  pvp.price_vat_incl
FROM public.product_variants pv
INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
WHERE pv.is_active = true;

-- =====================================================
-- 6. Create Promotion Target Variants
-- =====================================================

-- Promotion targeting by SKU/variant
CREATE TABLE IF NOT EXISTS public.promotion_target_variants (
  promotion_code TEXT NOT NULL REFERENCES public.promotions(code) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_promotion_variant UNIQUE(promotion_code, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_target_variants_promotion ON public.promotion_target_variants(promotion_code);
CREATE INDEX IF NOT EXISTS idx_promotion_target_variants_variant ON public.promotion_target_variants(variant_id);
CREATE INDEX IF NOT EXISTS idx_promotion_target_variants_enabled ON public.promotion_target_variants(is_enabled);
CREATE INDEX IF NOT EXISTS idx_promotion_target_variants_promo_enabled ON public.promotion_target_variants(promotion_code, is_enabled);

-- =====================================================
-- 7. Add Triggers for Updated_At
-- =====================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DO $$ BEGIN
  DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
  CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_subcategories_updated_at ON public.subcategories;
  CREATE TRIGGER update_subcategories_updated_at BEFORE UPDATE ON public.subcategories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_product_variants_updated_at ON public.product_variants;
  CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_product_variant_prices_updated_at ON public.product_variant_prices;
  CREATE TRIGGER update_product_variant_prices_updated_at BEFORE UPDATE ON public.product_variant_prices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_promotion_target_variants_updated_at ON public.promotion_target_variants;
  CREATE TRIGGER update_promotion_target_variants_updated_at BEFORE UPDATE ON public.promotion_target_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
END $$;

-- =====================================================
-- 8. Comments for Documentation
-- =====================================================

COMMENT ON TABLE public.categories IS 'Main product categories (2-tier hierarchy - top level)';
COMMENT ON TABLE public.subcategories IS 'Product subcategories / menu sections (2-tier hierarchy - second level)';
COMMENT ON TABLE public.product_variants IS 'Product variants by size with unique SKU codes';
COMMENT ON TABLE public.product_variant_prices IS 'Prices for each product variant/SKU';
COMMENT ON TABLE public.promotion_target_variants IS 'Promotion targeting by specific product variants/SKUs';
COMMENT ON VIEW public.v_product_prices_compat IS 'Compatibility view mapping new variant system to old price_key system';
