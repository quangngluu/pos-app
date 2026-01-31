-- =============================================================================
-- DEBUG SIZE SYNC QUERIES
-- Description: Diagnostic queries to identify size/price data issues
-- Date: 2026-01-31
-- Usage: Run these queries in Supabase SQL Editor to diagnose size sync issues
-- =============================================================================

-- #############################################################################
-- Q1) COUNT SẢN PHẨM CÓ VARIANTS
-- #############################################################################

-- Q1.1: Tổng số products active
SELECT 
  'Total active products' as metric,
  COUNT(*) as count
FROM public.products 
WHERE is_active = true;

-- Q1.2: Products có >=1 variant
SELECT 
  'Products with >=1 variant' as metric,
  COUNT(DISTINCT p.id) as count
FROM public.products p
INNER JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
WHERE p.is_active = true;

-- Q1.3: Products có >=2 variants (có thể chọn size)
SELECT 
  'Products with >=2 variants' as metric,
  COUNT(*) as count
FROM (
  SELECT p.id, COUNT(pv.id) as variant_count
  FROM public.products p
  LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
  WHERE p.is_active = true
  GROUP BY p.id
  HAVING COUNT(pv.id) >= 2
) sub;

-- Q1.4: Products có đủ STD + SIZE_PHE + SIZE_LA
SELECT 
  'Products with all 3 sizes (STD+PHE+LA)' as metric,
  COUNT(DISTINCT p.id) as count
FROM public.products p
WHERE p.is_active = true
  AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'STD' AND pv.is_active = true)
  AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE' AND pv.is_active = true)
  AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA' AND pv.is_active = true);

-- Q1.5: Variants thiếu price (CRITICAL - gây NULL trong view)
SELECT 
  'Variants missing prices' as metric,
  COUNT(*) as count
FROM public.product_variants pv
WHERE pv.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id
  );

-- Q1.6: SUMMARY - All counts in one query
SELECT 
  (SELECT COUNT(*) FROM public.products WHERE is_active = true) as total_products,
  (SELECT COUNT(DISTINCT pv.product_id) FROM public.product_variants pv WHERE pv.is_active = true) as products_with_variants,
  (SELECT COUNT(*) FROM (
    SELECT p.id FROM public.products p
    LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
    WHERE p.is_active = true
    GROUP BY p.id HAVING COUNT(pv.id) >= 2
  ) sub) as products_with_2plus_variants,
  (SELECT COUNT(*) FROM public.product_variants pv 
   WHERE pv.is_active = true 
   AND NOT EXISTS (SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id)
  ) as variants_missing_prices;


-- #############################################################################
-- Q2) SO SÁNH VIEW v_products_menu VỚI BẢNG VARIANTS
-- #############################################################################

-- Q2.1: Random 10 DRINK products - compare view prices vs actual variant prices
WITH view_prices AS (
  SELECT product_id, name, price_phe, price_la, price_std
  FROM public.v_products_menu
  WHERE category = 'DRINK'
  ORDER BY RANDOM()
  LIMIT 10
),
variant_prices AS (
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
)
SELECT 
  vp.product_id,
  vp.name,
  '--- VIEW ---' as separator1,
  vp.price_phe as view_price_phe,
  vp.price_la as view_price_la,
  vp.price_std as view_price_std,
  '--- VARIANTS ---' as separator2,
  (SELECT price_vat_incl FROM variant_prices WHERE product_id = vp.product_id AND size_key = 'SIZE_PHE') as variant_price_phe,
  (SELECT price_vat_incl FROM variant_prices WHERE product_id = vp.product_id AND size_key = 'SIZE_LA') as variant_price_la,
  (SELECT price_vat_incl FROM variant_prices WHERE product_id = vp.product_id AND size_key = 'STD') as variant_price_std
FROM view_prices vp;

-- Q2.2: Products where view has NULL but should have price (MISMATCH DETECTION)
SELECT 
  p.id as product_id,
  p.code,
  p.name,
  COALESCE(p.category_code, p.category) as category,
  vm.price_phe as view_phe,
  vm.price_la as view_la,
  vm.price_std as view_std,
  (SELECT COUNT(*) FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) as variant_count,
  (SELECT string_agg(pv.size_key::text, ', ') FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) as existing_sizes
FROM public.products p
LEFT JOIN public.v_products_menu vm ON vm.product_id = p.id
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND (vm.price_phe IS NULL OR vm.price_la IS NULL)
ORDER BY p.name
LIMIT 20;


-- #############################################################################
-- Q3) TÌM SẢN PHẨM UI ĐANG HIỂN THỊ STD NHƯNG THỰC TẾ CÓ SIZE_PHE/SIZE_LA
-- #############################################################################

-- Q3.1: DRINK products where view shows NULL for PHE but variants table has SIZE_PHE
SELECT 
  p.id,
  p.code,
  p.name,
  'Has SIZE_PHE variant but view.price_phe is NULL' as issue,
  pv.sku_code as variant_sku,
  pvp.price_vat_incl as actual_price
FROM public.products p
INNER JOIN public.product_variants pv ON pv.product_id = p.id AND pv.size_key = 'SIZE_PHE' AND pv.is_active = true
LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
LEFT JOIN public.v_products_menu vm ON vm.product_id = p.id
WHERE p.is_active = true
  AND vm.price_phe IS NULL
ORDER BY p.name;

-- Q3.2: DRINK products where view shows NULL for LA but variants table has SIZE_LA
SELECT 
  p.id,
  p.code,
  p.name,
  'Has SIZE_LA variant but view.price_la is NULL' as issue,
  pv.sku_code as variant_sku,
  pvp.price_vat_incl as actual_price
FROM public.products p
INNER JOIN public.product_variants pv ON pv.product_id = p.id AND pv.size_key = 'SIZE_LA' AND pv.is_active = true
LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
LEFT JOIN public.v_products_menu vm ON vm.product_id = p.id
WHERE p.is_active = true
  AND vm.price_la IS NULL
ORDER BY p.name;

-- Q3.3: Products with variants BUT missing prices (ROOT CAUSE of NULL in view)
SELECT 
  p.id,
  p.code,
  p.name,
  COALESCE(p.category_code, p.category) as category,
  pv.size_key,
  pv.sku_code,
  pvp.price_vat_incl,
  CASE WHEN pvp.price_vat_incl IS NULL THEN '⚠️ MISSING PRICE' ELSE '✅ OK' END as status
FROM public.products p
INNER JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
WHERE p.is_active = true
  AND pvp.price_vat_incl IS NULL
ORDER BY p.name, pv.size_key;


-- #############################################################################
-- Q4) CHECK MAPPING SIZE_KEY
-- #############################################################################

-- Q4.1: Distinct size_key values in product_variants (should be: STD, SIZE_PHE, SIZE_LA)
SELECT 
  'product_variants.size_key' as source,
  size_key::text as value,
  COUNT(*) as count
FROM public.product_variants
GROUP BY size_key
ORDER BY size_key;

-- Q4.2: Distinct price_key values in legacy product_prices (should be: PRICE_SMALL, PRICE_PHE, PRICE_LARGE)
SELECT 
  'product_prices.price_key' as source,
  price_key as value,
  COUNT(*) as count
FROM public.product_prices
GROUP BY price_key
ORDER BY price_key;

-- Q4.3: Check if product_skus exists and its values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_skus') THEN
    RAISE NOTICE 'product_skus table exists';
  ELSE
    RAISE NOTICE 'product_skus table does NOT exist';
  END IF;
END $$;

-- Q4.4: Mapping verification - ensure enum values match
SELECT 
  CASE 
    WHEN 'STD'::public.size_key = 'STD' THEN '✅ STD enum works'
    ELSE '❌ STD enum broken'
  END as std_check,
  CASE 
    WHEN 'SIZE_PHE'::public.size_key = 'SIZE_PHE' THEN '✅ SIZE_PHE enum works'
    ELSE '❌ SIZE_PHE enum broken'
  END as phe_check,
  CASE 
    WHEN 'SIZE_LA'::public.size_key = 'SIZE_LA' THEN '✅ SIZE_LA enum works'
    ELSE '❌ SIZE_LA enum broken'
  END as la_check;


-- #############################################################################
-- Q5) PRODUCTS MISSING VARIANTS (CANDIDATES FOR BACKFILL)
-- #############################################################################

-- Q5.1: Active DRINK products without ANY variants
SELECT 
  p.id,
  p.code,
  p.name,
  COALESCE(p.category_code, p.category) as category,
  'MISSING ALL VARIANTS' as issue
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id)
ORDER BY p.name;

-- Q5.2: Active DRINK products missing SIZE_PHE variant
SELECT 
  p.id,
  p.code,
  p.name,
  'MISSING SIZE_PHE' as issue
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
ORDER BY p.name;

-- Q5.3: Active DRINK products missing SIZE_LA variant
SELECT 
  p.id,
  p.code,
  p.name,
  'MISSING SIZE_LA' as issue
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA')
ORDER BY p.name;

-- Q5.4: Non-DRINK products without STD variant
SELECT 
  p.id,
  p.code,
  p.name,
  COALESCE(p.category_code, p.category) as category,
  'MISSING STD' as issue
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) != 'DRINK'
  AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'STD')
ORDER BY p.name;


-- #############################################################################
-- Q6) LEGACY DATA VERIFICATION
-- #############################################################################

-- Q6.1: Products in legacy product_prices but NOT in product_variants
SELECT 
  p.id,
  p.code,
  p.name,
  pp.price_key as legacy_price_key,
  pp.price_vat_incl as legacy_price,
  'In legacy but not in variants' as status
FROM public.products p
INNER JOIN public.product_prices pp ON pp.product_id = p.id
WHERE p.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id)
ORDER BY p.name, pp.price_key
LIMIT 20;

-- Q6.2: Compare legacy prices vs variant prices for same product
SELECT 
  p.id,
  p.code,
  p.name,
  pp.price_key as legacy_key,
  pp.price_vat_incl as legacy_price,
  pv.size_key as variant_size,
  pvp.price_vat_incl as variant_price,
  CASE 
    WHEN ABS(COALESCE(pp.price_vat_incl, 0) - COALESCE(pvp.price_vat_incl, 0)) > 1 THEN '⚠️ MISMATCH'
    ELSE '✅ OK'
  END as price_match
FROM public.products p
INNER JOIN public.product_prices pp ON pp.product_id = p.id
LEFT JOIN public.product_variants pv ON pv.product_id = p.id 
  AND pv.size_key::text = 
    CASE pp.price_key
      WHEN 'PRICE_SMALL' THEN 'STD'
      WHEN 'PRICE_PHE' THEN 'SIZE_PHE'
      WHEN 'PRICE_LARGE' THEN 'SIZE_LA'
    END
LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
WHERE p.is_active = true
ORDER BY p.name, pp.price_key
LIMIT 30;


-- #############################################################################
-- Q7) FINAL DIAGNOSTIC SUMMARY
-- #############################################################################

SELECT '=== DIAGNOSTIC SUMMARY ===' as section;

SELECT 
  'Total active products' as metric,
  (SELECT COUNT(*) FROM public.products WHERE is_active = true)::text as value
UNION ALL
SELECT 
  'Products with variants',
  (SELECT COUNT(DISTINCT product_id) FROM public.product_variants WHERE is_active = true)::text
UNION ALL
SELECT 
  'DRINK products total',
  (SELECT COUNT(*) FROM public.products WHERE is_active = true AND COALESCE(category_code, category) = 'DRINK')::text
UNION ALL
SELECT 
  'DRINK products with both PHE+LA',
  (SELECT COUNT(DISTINCT p.id) FROM public.products p
   WHERE COALESCE(p.category_code, p.category) = 'DRINK' AND p.is_active = true
   AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
   AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA'))::text
UNION ALL
SELECT 
  '⚠️ DRINK products MISSING PHE or LA',
  (SELECT COUNT(DISTINCT p.id) FROM public.products p
   WHERE COALESCE(p.category_code, p.category) = 'DRINK' AND p.is_active = true
   AND (NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
        OR NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA')))::text
UNION ALL
SELECT 
  '⚠️ Variants without prices',
  (SELECT COUNT(*) FROM public.product_variants pv 
   WHERE pv.is_active = true 
   AND NOT EXISTS (SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id))::text
UNION ALL
SELECT 
  'View entries with NULL prices',
  (SELECT COUNT(*) FROM public.v_products_menu 
   WHERE category = 'DRINK' AND (price_phe IS NULL OR price_la IS NULL))::text;
