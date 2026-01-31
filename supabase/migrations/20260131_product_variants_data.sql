-- Data Migration: Populate Product Variants from Staging Data
-- Description: Migrate data from stg_products_sku_section to normalized variant model
-- Date: 2026-01-31
-- Prerequisites: Run 20260131_product_variants_schema.sql first

-- =====================================================
-- 1. Populate Categories from Staging
-- =====================================================

-- Extract unique categories and populate categories table
INSERT INTO public.categories (code, name, sort_order, is_active)
SELECT DISTINCT
  UPPER(TRIM(category)) AS code,
  INITCAP(TRIM(category)) AS name,
  ROW_NUMBER() OVER (ORDER BY TRIM(category)) AS sort_order,
  true AS is_active
FROM public.stg_products_sku_section
WHERE category IS NOT NULL AND TRIM(category) != ''
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- =====================================================
-- 2. Populate Subcategories from Staging
-- =====================================================

-- Extract unique subcategories (menu sections) and populate subcategories table
-- Priority: menu_section_pppc, fallback to menu_section_suggested
INSERT INTO public.subcategories (category_code, name, sort_order, is_active)
SELECT DISTINCT
  UPPER(TRIM(category)) AS category_code,
  TRIM(COALESCE(NULLIF(menu_section_pppc, ''), menu_section_suggested)) AS name,
  ROW_NUMBER() OVER (
    PARTITION BY UPPER(TRIM(category)) 
    ORDER BY TRIM(COALESCE(NULLIF(menu_section_pppc, ''), menu_section_suggested))
  ) AS sort_order,
  true AS is_active
FROM public.stg_products_sku_section
WHERE category IS NOT NULL AND TRIM(category) != ''
  AND TRIM(COALESCE(NULLIF(menu_section_pppc, ''), menu_section_suggested)) IS NOT NULL
  AND TRIM(COALESCE(NULLIF(menu_section_pppc, ''), menu_section_suggested)) != ''
ON CONFLICT (category_code, name) DO UPDATE SET
  updated_at = NOW();

-- =====================================================
-- 3. Update Products with Category References
-- =====================================================

-- Update products table with category_code
UPDATE public.products p
SET 
  category_code = UPPER(TRIM(s.category)),
  updated_at = NOW()
FROM public.stg_products_sku_section s
WHERE p.code = s.product_code
  AND s.category IS NOT NULL 
  AND TRIM(s.category) != '';

-- Update products table with subcategory_id
UPDATE public.products p
SET 
  subcategory_id = sub.id,
  updated_at = NOW()
FROM public.stg_products_sku_section s
INNER JOIN public.subcategories sub ON 
  sub.category_code = UPPER(TRIM(s.category))
  AND sub.name = TRIM(COALESCE(NULLIF(s.menu_section_pppc, ''), s.menu_section_suggested))
WHERE p.code = s.product_code
  AND TRIM(COALESCE(NULLIF(s.menu_section_pppc, ''), s.menu_section_suggested)) IS NOT NULL
  AND TRIM(COALESCE(NULLIF(s.menu_section_pppc, ''), s.menu_section_suggested)) != '';

-- =====================================================
-- 4. Create Product Variants
-- =====================================================

-- Create STD variants for all products
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id AS product_id,
  'STD'::public.size_key AS size_key,
  COALESCE(NULLIF(TRIM(s.sku_std), ''), p.code || '_STD') AS sku_code,
  true AS is_active,
  1 AS sort_order
FROM public.products p
INNER JOIN public.stg_products_sku_section s ON s.product_code = p.code
ON CONFLICT (product_id, size_key) DO UPDATE SET
  sku_code = EXCLUDED.sku_code,
  updated_at = NOW();

-- Create SIZE_PHE variants where sku_phe is not empty
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id AS product_id,
  'SIZE_PHE'::public.size_key AS size_key,
  TRIM(s.sku_phe) AS sku_code,
  true AS is_active,
  2 AS sort_order
FROM public.products p
INNER JOIN public.stg_products_sku_section s ON s.product_code = p.code
WHERE s.sku_phe IS NOT NULL 
  AND TRIM(s.sku_phe) != ''
ON CONFLICT (product_id, size_key) DO UPDATE SET
  sku_code = EXCLUDED.sku_code,
  updated_at = NOW();

-- Create SIZE_LA variants where sku_la is not empty
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id AS product_id,
  'SIZE_LA'::public.size_key AS size_key,
  TRIM(s.sku_la) AS sku_code,
  true AS is_active,
  3 AS sort_order
FROM public.products p
INNER JOIN public.stg_products_sku_section s ON s.product_code = p.code
WHERE s.sku_la IS NOT NULL 
  AND TRIM(s.sku_la) != ''
ON CONFLICT (product_id, size_key) DO UPDATE SET
  sku_code = EXCLUDED.sku_code,
  updated_at = NOW();

-- =====================================================
-- 5. Migrate Product Prices to Variant Prices
-- =====================================================

-- Check if product_prices table exists and migrate data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_prices'
  ) THEN
    -- Migrate prices from old product_prices table to new product_variant_prices
    -- Map price_key to size_key: PRICE_SMALL -> STD, PRICE_PHE -> SIZE_PHE, PRICE_LARGE -> SIZE_LA
    
    INSERT INTO public.product_variant_prices (variant_id, price_vat_incl, updated_at)
    SELECT 
      pv.id AS variant_id,
      pp.price_vat_incl,
      COALESCE(pp.updated_at, NOW()) AS updated_at
    FROM public.product_prices pp
    INNER JOIN public.product_variants pv ON pv.product_id = pp.product_id
    WHERE 
      (pp.price_key = 'PRICE_SMALL' AND pv.size_key = 'STD')
      OR (pp.price_key = 'PRICE_PHE' AND pv.size_key = 'SIZE_PHE')
      OR (pp.price_key = 'PRICE_LARGE' AND pv.size_key = 'SIZE_LA')
    ON CONFLICT (variant_id) DO UPDATE SET
      price_vat_incl = EXCLUDED.price_vat_incl,
      updated_at = EXCLUDED.updated_at;
    
    RAISE NOTICE 'Successfully migrated prices from product_prices to product_variant_prices';
  ELSE
    RAISE NOTICE 'Table product_prices does not exist, skipping price migration';
  END IF;
END $$;

-- =====================================================
-- 6. Data Validation and Summary
-- =====================================================

-- Report migration statistics
DO $$
DECLARE
  v_categories_count INTEGER;
  v_subcategories_count INTEGER;
  v_products_updated INTEGER;
  v_variants_count INTEGER;
  v_variant_prices_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_categories_count FROM public.categories;
  SELECT COUNT(*) INTO v_subcategories_count FROM public.subcategories;
  SELECT COUNT(*) INTO v_products_updated FROM public.products WHERE category_code IS NOT NULL;
  SELECT COUNT(*) INTO v_variants_count FROM public.product_variants;
  SELECT COUNT(*) INTO v_variant_prices_count FROM public.product_variant_prices;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Data Migration Summary:';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Categories created: %', v_categories_count;
  RAISE NOTICE 'Subcategories created: %', v_subcategories_count;
  RAISE NOTICE 'Products updated with categories: %', v_products_updated;
  RAISE NOTICE 'Product variants created: %', v_variants_count;
  RAISE NOTICE 'Variant prices migrated: %', v_variant_prices_count;
  RAISE NOTICE '============================================';
END $$;

-- Validate data integrity
DO $$
DECLARE
  v_products_without_category INTEGER;
  v_variants_without_price INTEGER;
BEGIN
  -- Check products without categories
  SELECT COUNT(*) INTO v_products_without_category 
  FROM public.products 
  WHERE category_code IS NULL AND is_active = true;
  
  -- Check active variants without prices
  SELECT COUNT(*) INTO v_variants_without_price
  FROM public.product_variants pv
  LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true AND pvp.variant_id IS NULL;
  
  IF v_products_without_category > 0 THEN
    RAISE WARNING 'Found % active products without category assignment', v_products_without_category;
  END IF;
  
  IF v_variants_without_price > 0 THEN
    RAISE WARNING 'Found % active variants without price assignment', v_variants_without_price;
  END IF;
  
  IF v_products_without_category = 0 AND v_variants_without_price = 0 THEN
    RAISE NOTICE 'Data validation passed: All active products have categories and all active variants have prices';
  END IF;
END $$;
