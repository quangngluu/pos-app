-- =============================================================================
-- SIZE SYNC FIX - COPY-PASTE INTO SUPABASE SQL EDITOR
-- Date: 2026-01-31
-- 
-- ROOT CAUSE: The view's CASE mapping expected 'PRICE_SMALL'/'PRICE_PHE'/'PRICE_LARGE'
-- but actual data uses 'STD'/'SIZE_PHE'/'SIZE_LA', causing all prices to map to STD.
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Copy this entire file and paste
-- 3. Click "Run"
-- 4. Verify output shows correct counts
-- =============================================================================

-- Drop and recreate the view with FIXED CASE mapping
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

CREATE OR REPLACE VIEW public.v_products_menu AS
WITH variant_prices AS (
  -- Get prices from variant pricing (source of truth when variants exist)
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
legacy_prices AS (
  -- FIXED: Map ACTUAL price_key values from product_prices
  -- Data uses: 'STD', 'SIZE_PHE', 'SIZE_LA' (not 'PRICE_SMALL', 'PRICE_PHE', 'PRICE_LARGE')
  SELECT 
    pp.product_id,
    CASE 
      -- Actual data format (this is what exists in the DB)
      WHEN pp.price_key = 'STD' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'SIZE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'SIZE_LA' THEN 'SIZE_LA'::public.size_key
      -- Old format (keep for backward compatibility)
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
      -- Default fallback
      ELSE 'STD'::public.size_key
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
),
all_prices AS (
  -- Combine: variant prices first, then legacy for any missing
  SELECT product_id, size_key, price_vat_incl FROM variant_prices
  UNION ALL
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
  -- Pivot prices by size
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
  p.id, p.code, p.name, p.category_code, p.category, p.menu_section, 
  p.is_active, p.subcategory_id, c.name, sc.name, sc.id;

-- Grant permissions
GRANT SELECT ON public.v_products_menu TO anon, authenticated;

-- Add documentation
COMMENT ON VIEW public.v_products_menu IS 
  'POS menu view - FIXED 2026-01-31: Correct price_key mapping for STD/SIZE_PHE/SIZE_LA';

-- =============================================================================
-- VERIFICATION QUERIES - Check the fix worked
-- =============================================================================

-- Check DRK_OLS specifically (should now have PHE=54000, LA=69000)
SELECT 'TEST: DRK_OLS' as test, product_code, price_phe, price_la, price_std
FROM public.v_products_menu
WHERE product_code = 'DRK_OLS';

-- Count DRINK products with proper size prices
SELECT 
  'DRINK products with price_phe' as metric,
  COUNT(*) as count
FROM public.v_products_menu
WHERE category = 'DRINK' AND price_phe IS NOT NULL
UNION ALL
SELECT 
  'DRINK products with price_la',
  COUNT(*)
FROM public.v_products_menu
WHERE category = 'DRINK' AND price_la IS NOT NULL
UNION ALL
SELECT 
  'DRINK products with BOTH PHE+LA',
  COUNT(*)
FROM public.v_products_menu
WHERE category = 'DRINK' AND price_phe IS NOT NULL AND price_la IS NOT NULL
UNION ALL
SELECT 
  'DRINK products STD-only (Plus items)',
  COUNT(*)
FROM public.v_products_menu
WHERE category = 'DRINK' AND price_phe IS NULL AND price_la IS NULL AND price_std IS NOT NULL;

-- Sample products with both sizes (should see real prices now)
SELECT product_code, name, price_phe, price_la, price_std
FROM public.v_products_menu
WHERE category = 'DRINK' AND price_phe IS NOT NULL AND price_la IS NOT NULL
ORDER BY name
LIMIT 10;
