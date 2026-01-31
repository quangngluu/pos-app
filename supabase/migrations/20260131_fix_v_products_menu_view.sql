-- =============================================================================
-- Migration: Fix v_products_menu View to Handle Partial Variants
-- Description: Update view to use LEFT JOIN and handle edge cases where variants 
--              exist but prices are missing
-- Date: 2026-01-31
-- Priority: P1
-- 
-- ROOT CAUSE FIXED:
-- The original view uses INNER JOIN between product_variants and product_variant_prices
-- If a variant exists but has no price, the INNER JOIN excludes it entirely
-- This causes NULL prices in the view even when variants exist
-- =============================================================================

-- Drop and recreate the view with improved join logic
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

CREATE OR REPLACE VIEW public.v_products_menu AS
WITH 
-- Get variant prices (LEFT JOIN to handle missing prices)
variant_data AS (
  SELECT 
    pv.product_id,
    pv.size_key,
    pv.sku_code,
    pvp.price_vat_incl
  FROM public.product_variants pv
  LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
-- Legacy prices for fallback (only for products WITHOUT any variants)
legacy_prices_no_variants AS (
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
    SELECT 1 FROM public.product_variants pv WHERE pv.product_id = pp.product_id
  )
),
-- Legacy prices for GAP FILL (when variant exists but price is NULL)
legacy_prices_gap_fill AS (
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
),
-- Combined prices: variant first, then legacy gap fill, then legacy no variants
all_prices AS (
  -- Variant prices (may have NULLs)
  SELECT 
    vd.product_id,
    vd.size_key,
    COALESCE(vd.price_vat_incl, lgf.price_vat_incl) as price_vat_incl
  FROM variant_data vd
  LEFT JOIN legacy_prices_gap_fill lgf 
    ON lgf.product_id = vd.product_id 
    AND lgf.size_key = vd.size_key
  WHERE vd.price_vat_incl IS NOT NULL OR lgf.price_vat_incl IS NOT NULL
  
  UNION ALL
  
  -- Legacy prices for products without any variants
  SELECT * FROM legacy_prices_no_variants
)
SELECT 
  p.id AS product_id,
  p.code AS product_code,
  p.name,
  COALESCE(p.category_code, p.category) AS category,
  p.menu_section,
  p.is_active,
  p.subcategory_id,
  -- Pivot prices (now with gap fill from legacy)
  MAX(CASE WHEN ap.size_key = 'SIZE_PHE' THEN ap.price_vat_incl END) AS price_phe,
  MAX(CASE WHEN ap.size_key = 'SIZE_LA' THEN ap.price_vat_incl END) AS price_la,
  MAX(CASE WHEN ap.size_key = 'STD' THEN ap.price_vat_incl END) AS price_std,
  -- Category info
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
  'POS menu view with variant pricing (gap-filled from legacy), category support, and 2-tier hierarchy. Fixed: handles partial variants with missing prices.';

-- Grant permissions
GRANT SELECT ON public.v_products_menu TO anon, authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_total_products INTEGER;
  v_products_with_prices INTEGER;
  v_drinks_with_both INTEGER;
  v_drinks_with_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_products FROM public.v_products_menu;
  
  SELECT COUNT(*) INTO v_products_with_prices 
  FROM public.v_products_menu
  WHERE price_std IS NOT NULL OR price_phe IS NOT NULL OR price_la IS NOT NULL;
  
  SELECT COUNT(*) INTO v_drinks_with_both
  FROM public.v_products_menu
  WHERE category = 'DRINK'
    AND price_phe IS NOT NULL 
    AND price_la IS NOT NULL;
    
  SELECT COUNT(*) INTO v_drinks_with_null
  FROM public.v_products_menu
  WHERE category = 'DRINK'
    AND (price_phe IS NULL OR price_la IS NULL);
  
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'v_products_menu VIEW FIX COMPLETE';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Total products in view: %', v_total_products;
  RAISE NOTICE 'Products with at least one price: %', v_products_with_prices;
  RAISE NOTICE 'DRINK products with both PHE+LA: %', v_drinks_with_both;
  RAISE NOTICE 'DRINK products still missing PHE or LA: %', v_drinks_with_null;
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - Uses LEFT JOIN for variant_data to handle missing prices';
  RAISE NOTICE '  - Added legacy_prices_gap_fill CTE to fill NULL variant prices';
  RAISE NOTICE '  - COALESCE(variant_price, legacy_price) for each size';
  RAISE NOTICE '========================================================';
END $$;
