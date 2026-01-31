-- =============================================================================
-- Migration: Fix v_products_menu Price Key Mapping
-- Date: 2026-01-31
-- Priority: P0 CRITICAL
-- 
-- ROOT CAUSE:
-- The legacy_prices CTE expected price_key values: 'PRICE_SMALL', 'PRICE_PHE', 'PRICE_LARGE'
-- But actual data in product_prices uses: 'STD', 'SIZE_PHE', 'SIZE_LA'
-- This caused ALL legacy prices to fall to ELSE clause and map to STD,
-- resulting in price_phe=null and price_la=null for all DRINK products.
--
-- FIX:
-- Update the CASE mapping to match actual data format.
-- =============================================================================

-- Drop and recreate the view with correct mapping
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

CREATE OR REPLACE VIEW public.v_products_menu AS
WITH variant_prices AS (
  -- Get prices from variant pricing (source of truth)
  -- Currently empty (0 rows), but will be used when variants are created
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
legacy_prices AS (
  -- Fallback to legacy product_prices
  -- FIXED: Map actual price_key values (STD, SIZE_PHE, SIZE_LA) not old format
  SELECT 
    pp.product_id,
    CASE 
      -- New format (actual data uses these)
      WHEN pp.price_key = 'STD' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'SIZE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'SIZE_LA' THEN 'SIZE_LA'::public.size_key
      -- Old format (keep for backward compatibility if any old data exists)
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
      -- Default fallback
      ELSE 'STD'::public.size_key
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
  -- Include legacy prices for all products (variant prices will override in UNION)
),
all_prices AS (
  -- Variant prices take priority (listed first, will be used when variants exist)
  SELECT product_id, size_key, price_vat_incl FROM variant_prices
  UNION ALL
  -- Legacy prices as fallback (only used when no variant price exists for that product+size)
  SELECT lp.product_id, lp.size_key, lp.price_vat_incl 
  FROM legacy_prices lp
  WHERE NOT EXISTS (
    SELECT 1 FROM variant_prices vp 
    WHERE vp.product_id = lp.product_id AND vp.size_key = lp.size_key
  )
)
SELECT 
  p.id AS product_id,
  p.code AS product_code,
  p.name,
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
  'POS menu view with FIXED price_key mapping. Supports both legacy (STD/SIZE_PHE/SIZE_LA) and variant pricing.';

-- Grant permissions
GRANT SELECT ON public.v_products_menu TO anon, authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_total_products INTEGER;
  v_drinks_with_phe INTEGER;
  v_drinks_with_la INTEGER;
  v_drinks_both INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_products FROM public.v_products_menu;
  
  SELECT COUNT(*) INTO v_drinks_with_phe
  FROM public.v_products_menu
  WHERE category = 'DRINK' AND price_phe IS NOT NULL;
  
  SELECT COUNT(*) INTO v_drinks_with_la
  FROM public.v_products_menu
  WHERE category = 'DRINK' AND price_la IS NOT NULL;
  
  SELECT COUNT(*) INTO v_drinks_both
  FROM public.v_products_menu
  WHERE category = 'DRINK' AND price_phe IS NOT NULL AND price_la IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'v_products_menu VIEW FIX APPLIED';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Total products in view: %', v_total_products;
  RAISE NOTICE 'DRINK products with price_phe: %', v_drinks_with_phe;
  RAISE NOTICE 'DRINK products with price_la: %', v_drinks_with_la;
  RAISE NOTICE 'DRINK products with BOTH PHE+LA: %', v_drinks_both;
  RAISE NOTICE '========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'FIX APPLIED: CASE mapping now correctly handles:';
  RAISE NOTICE '  - STD -> STD';
  RAISE NOTICE '  - SIZE_PHE -> SIZE_PHE';
  RAISE NOTICE '  - SIZE_LA -> SIZE_LA';
  RAISE NOTICE '  - (Plus legacy PRICE_SMALL/PRICE_PHE/PRICE_LARGE for compatibility)';
  RAISE NOTICE '';
END $$;
