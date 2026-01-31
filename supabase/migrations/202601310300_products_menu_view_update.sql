-- Migration: v_products_menu View Update + Schema Adjustments
-- Description: Update view to use category_code and variant pricing, add schema improvements
-- Date: 2026-01-31

-- =====================================================
-- SECTION 1: SCHEMA ADJUSTMENTS
-- =====================================================

-- Add products.subcategory_id if not exists (already handled in normalize migration but ensure here too)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'products' 
      AND column_name = 'subcategory_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN subcategory_id UUID NULL;
    RAISE NOTICE 'Added column products.subcategory_id';
  END IF;
END $$;

-- Add FK constraint for subcategory_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'products'
      AND constraint_name = 'fk_products_subcategory_id'
  ) THEN
    ALTER TABLE public.products 
      ADD CONSTRAINT fk_products_subcategory_id 
      FOREIGN KEY (subcategory_id) 
      REFERENCES public.subcategories(id) 
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    RAISE NOTICE 'Added FK: products.subcategory_id -> subcategories.id';
  END IF;
END $$;

-- Replace CHECK constraint on products.category_code with FK to categories
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Drop any CHECK constraints on category_code
  FOR v_constraint_name IN 
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'products'
      AND con.contype = 'c'
      AND att.attname = 'category_code'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    RAISE NOTICE 'Dropped CHECK constraint: %', v_constraint_name;
  END LOOP;
  
  -- Drop old FK if exists with different name
  ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_code_fkey;
  
  -- Add new FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'products'
      AND constraint_name = 'fk_products_category_code'
  ) THEN
    ALTER TABLE public.products 
      ADD CONSTRAINT fk_products_category_code 
      FOREIGN KEY (category_code) 
      REFERENCES public.categories(code) 
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    RAISE NOTICE 'Added FK: products.category_code -> categories.code';
  END IF;
END $$;

-- Add indexes for admin lookups
CREATE INDEX IF NOT EXISTS idx_products_category_code ON public.products(category_code);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);

CREATE INDEX IF NOT EXISTS idx_categories_code ON public.categories(code);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_subcategories_category_code ON public.subcategories(category_code);
CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON public.subcategories(is_active);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_code ON public.product_variants(sku_code);
CREATE INDEX IF NOT EXISTS idx_product_variants_is_active ON public.product_variants(is_active);

-- =====================================================
-- SECTION 2: UPDATE v_products_menu VIEW
-- =====================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

-- Create updated view with variant pricing and category_code
CREATE OR REPLACE VIEW public.v_products_menu AS
WITH variant_prices AS (
  -- Get prices from variant pricing (source of truth)
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
legacy_prices AS (
  -- Fallback to legacy product_prices for products without variants
  SELECT 
    pp.product_id,
    CASE 
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
      ELSE 'STD'::public.size_key
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv 
    WHERE pv.product_id = pp.product_id
  )
),
all_prices AS (
  -- Union variant and legacy prices
  SELECT * FROM variant_prices
  UNION ALL
  SELECT * FROM legacy_prices
)
SELECT 
  p.id AS product_id,
  p.code AS product_code,
  p.name,
  -- Use category_code as primary, fallback to legacy category column
  COALESCE(p.category_code, p.category) AS category,
  p.menu_section,
  p.is_active,
  p.subcategory_id,
  -- Pivot prices
  MAX(CASE WHEN ap.size_key = 'SIZE_PHE' THEN ap.price_vat_incl END) AS price_phe,
  MAX(CASE WHEN ap.size_key = 'SIZE_LA' THEN ap.price_vat_incl END) AS price_la,
  MAX(CASE WHEN ap.size_key = 'STD' THEN ap.price_vat_incl END) AS price_std,
  -- Category info (joined)
  c.name AS category_name,
  sc.name AS subcategory_name,
  sc.id AS subcategory_id_resolved
FROM public.products p
LEFT JOIN all_prices ap ON ap.product_id = p.id
LEFT JOIN public.categories c ON c.code = COALESCE(p.category_code, p.category)
LEFT JOIN public.subcategories sc ON sc.id = p.subcategory_id
WHERE p.is_active = true
GROUP BY 
  p.id, 
  p.code, 
  p.name, 
  p.category_code, 
  p.category, 
  p.menu_section, 
  p.is_active,
  p.subcategory_id,
  c.name,
  sc.name,
  sc.id;

-- Add comment
COMMENT ON VIEW public.v_products_menu IS 
  'POS menu view with category_code (primary), variant pricing (with legacy fallback), and 2-tier category hierarchy';

-- Grant permissions (adjust as needed)
GRANT SELECT ON public.v_products_menu TO anon, authenticated;

-- =====================================================
-- SECTION 3: VALIDATION
-- =====================================================

DO $$
DECLARE
  v_view_count INTEGER;
  v_products_with_prices INTEGER;
BEGIN
  -- Check view exists and has data
  SELECT COUNT(*) INTO v_view_count FROM public.v_products_menu;
  
  SELECT COUNT(*) INTO v_products_with_prices 
  FROM public.v_products_menu
  WHERE price_std IS NOT NULL OR price_phe IS NOT NULL OR price_la IS NOT NULL;
  
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'v_products_menu VIEW UPDATE COMPLETE';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Total active products in view: %', v_view_count;
  RAISE NOTICE 'Products with at least one price: %', v_products_with_prices;
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Schema adjustments:';
  RAISE NOTICE '  - products.subcategory_id: Added/verified';
  RAISE NOTICE '  - FK constraints: Added for category_code, subcategory_id';
  RAISE NOTICE '  - CHECK constraints: Removed from category_code';
  RAISE NOTICE '  - Indexes: Added for admin performance';
  RAISE NOTICE '========================================================';
END $$;
