-- Migration: Fix Missing Variants for DRINK Products
-- Description: Auto-generate STD/SIZE_PHE/SIZE_LA variants for products that are missing them
-- Date: 2026-01-31

-- =====================================================
-- TASK D: DIAGNOSTIC QUERIES
-- =====================================================

-- Query 1: Products missing ANY variants
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM public.products p
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id
    );
  RAISE NOTICE 'Products missing variants: %', missing_count;
END $$;

-- Query 2: DRINK products that should have SIZE_PHE/SIZE_LA but missing
DO $$
DECLARE
  drink_missing_sizes INTEGER;
BEGIN
  SELECT COUNT(*) INTO drink_missing_sizes
  FROM public.products p
  WHERE p.is_active = true
    AND COALESCE(p.category_code, p.category) = 'DRINK'
    AND (
      NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
      OR NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA')
    );
  RAISE NOTICE 'DRINK products missing PHE or LA variant: %', drink_missing_sizes;
END $$;

-- Query 3: Variants missing price records
DO $$
DECLARE
  variants_no_price INTEGER;
BEGIN
  SELECT COUNT(*) INTO variants_no_price
  FROM public.product_variants pv
  WHERE pv.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id
    );
  RAISE NOTICE 'Active variants missing prices: %', variants_no_price;
END $$;

-- =====================================================
-- FIX: Auto-generate missing variants for DRINK products
-- =====================================================

-- Step 1: Create SIZE_PHE variants for DRINK products that don't have them
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id,
  'SIZE_PHE'::public.size_key,
  CONCAT(p.code, '_PHE'),
  true,
  1
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv 
    WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE'
  )
ON CONFLICT (product_id, size_key) DO NOTHING;

-- Step 2: Create SIZE_LA variants for DRINK products that don't have them
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id,
  'SIZE_LA'::public.size_key,
  CONCAT(p.code, '_LA'),
  true,
  2
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) = 'DRINK'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv 
    WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA'
  )
ON CONFLICT (product_id, size_key) DO NOTHING;

-- Step 3: Create STD variants for non-DRINK products that don't have any variants
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT 
  p.id,
  'STD'::public.size_key,
  CONCAT(p.code, '_STD'),
  true,
  0
FROM public.products p
WHERE p.is_active = true
  AND COALESCE(p.category_code, p.category) != 'DRINK'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id
  )
ON CONFLICT (product_id, size_key) DO NOTHING;

-- =====================================================
-- FIX: Create prices for variants using legacy product_prices as source
-- =====================================================

-- Step 4: Create prices for SIZE_PHE variants from legacy PRICE_PHE
INSERT INTO public.product_variant_prices (variant_id, price_vat_incl)
SELECT 
  pv.id,
  COALESCE(pp.price_vat_incl, 29000) -- Default DRINK PHE price
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
LEFT JOIN public.product_prices pp ON pp.product_id = pv.product_id AND pp.price_key = 'PRICE_PHE'
WHERE pv.size_key = 'SIZE_PHE'
  AND pv.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id
  )
ON CONFLICT (variant_id) DO NOTHING;

-- Step 5: Create prices for SIZE_LA variants from legacy PRICE_LARGE
INSERT INTO public.product_variant_prices (variant_id, price_vat_incl)
SELECT 
  pv.id,
  COALESCE(pp.price_vat_incl, 35000) -- Default DRINK LA price
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
LEFT JOIN public.product_prices pp ON pp.product_id = pv.product_id AND pp.price_key = 'PRICE_LARGE'
WHERE pv.size_key = 'SIZE_LA'
  AND pv.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id
  )
ON CONFLICT (variant_id) DO NOTHING;

-- Step 6: Create prices for STD variants from legacy PRICE_SMALL
INSERT INTO public.product_variant_prices (variant_id, price_vat_incl)
SELECT 
  pv.id,
  COALESCE(pp.price_vat_incl, 25000) -- Default STD price
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
LEFT JOIN public.product_prices pp ON pp.product_id = pv.product_id AND pp.price_key = 'PRICE_SMALL'
WHERE pv.size_key = 'STD'
  AND pv.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id
  )
ON CONFLICT (variant_id) DO NOTHING;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  total_variants INTEGER;
  variants_with_prices INTEGER;
  drinks_with_both_sizes INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_variants FROM public.product_variants WHERE is_active = true;
  
  SELECT COUNT(*) INTO variants_with_prices
  FROM public.product_variants pv
  WHERE pv.is_active = true
    AND EXISTS (SELECT 1 FROM public.product_variant_prices pvp WHERE pvp.variant_id = pv.id);
  
  SELECT COUNT(DISTINCT p.id) INTO drinks_with_both_sizes
  FROM public.products p
  WHERE COALESCE(p.category_code, p.category) = 'DRINK'
    AND p.is_active = true
    AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
    AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA');

  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION RESULTS ===';
  RAISE NOTICE 'Total active variants: %', total_variants;
  RAISE NOTICE 'Variants with prices: %', variants_with_prices;
  RAISE NOTICE 'DRINK products with both PHE+LA: %', drinks_with_both_sizes;
  RAISE NOTICE '============================';
END $$;
