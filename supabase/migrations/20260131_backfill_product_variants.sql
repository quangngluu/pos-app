-- =============================================================================
-- Migration: Backfill Product Variants from Legacy Prices (OPTIONAL)
-- Date: 2026-01-31
-- Priority: P2 (Optional - for future variant-based system)
-- 
-- PURPOSE:
-- Create product_variants and product_variant_prices records from existing
-- product_prices data. This prepares for full migration to variant-based pricing.
--
-- NOTE: This is OPTIONAL. The view fix (20260131_fix_v_products_menu_mapping.sql)
-- already makes the system work with legacy prices.
-- =============================================================================

-- Only run this if you want to populate the variant tables

-- Step 1: Create variants from legacy prices
INSERT INTO public.product_variants (product_id, size_key, sku_code, is_active, sort_order)
SELECT DISTINCT
  pp.product_id,
  CASE 
    WHEN pp.price_key = 'STD' THEN 'STD'::public.size_key
    WHEN pp.price_key = 'SIZE_PHE' THEN 'SIZE_PHE'::public.size_key
    WHEN pp.price_key = 'SIZE_LA' THEN 'SIZE_LA'::public.size_key
    WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
    WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
    WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
  END as size_key,
  -- Generate SKU: product_code + size suffix
  p.code || '_' || 
    CASE 
      WHEN pp.price_key IN ('STD', 'PRICE_SMALL') THEN 'STD'
      WHEN pp.price_key IN ('SIZE_PHE', 'PRICE_PHE') THEN 'PHE'
      WHEN pp.price_key IN ('SIZE_LA', 'PRICE_LARGE') THEN 'LA'
    END as sku_code,
  true as is_active,
  CASE 
    WHEN pp.price_key IN ('SIZE_PHE', 'PRICE_PHE') THEN 1
    WHEN pp.price_key IN ('SIZE_LA', 'PRICE_LARGE') THEN 2
    ELSE 0
  END as sort_order
FROM public.product_prices pp
INNER JOIN public.products p ON p.id = pp.product_id
WHERE p.is_active = true
  AND pp.price_key IN ('STD', 'SIZE_PHE', 'SIZE_LA', 'PRICE_SMALL', 'PRICE_PHE', 'PRICE_LARGE')
ON CONFLICT (product_id, size_key) DO NOTHING;

-- Step 2: Create variant prices from legacy
INSERT INTO public.product_variant_prices (variant_id, price_vat_incl)
SELECT 
  pv.id as variant_id,
  pp.price_vat_incl
FROM public.product_variants pv
INNER JOIN public.products p ON p.id = pv.product_id
INNER JOIN public.product_prices pp ON pp.product_id = pv.product_id
  AND (
    (pv.size_key = 'STD' AND pp.price_key IN ('STD', 'PRICE_SMALL'))
    OR (pv.size_key = 'SIZE_PHE' AND pp.price_key IN ('SIZE_PHE', 'PRICE_PHE'))
    OR (pv.size_key = 'SIZE_LA' AND pp.price_key IN ('SIZE_LA', 'PRICE_LARGE'))
  )
WHERE p.is_active = true
ON CONFLICT (variant_id) DO NOTHING;

-- Verification
DO $$
DECLARE
  v_variant_count INTEGER;
  v_price_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_variant_count FROM public.product_variants;
  SELECT COUNT(*) INTO v_price_count FROM public.product_variant_prices;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'VARIANT BACKFILL COMPLETE';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Variants created: %', v_variant_count;
  RAISE NOTICE 'Variant prices created: %', v_price_count;
  RAISE NOTICE '========================================================';
END $$;

-- Report variants that were created but couldn't find a legacy price (price=0 or missing)
SELECT 
  p.code,
  p.name,
  pv.size_key,
  pv.sku_code,
  COALESCE(pvp.price_vat_incl, 0) as price,
  CASE WHEN pvp.price_vat_incl IS NULL THEN '⚠️ NEEDS PRICE' ELSE '✅ OK' END as status
FROM public.product_variants pv
INNER JOIN public.products p ON p.id = pv.product_id
LEFT JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
WHERE pvp.price_vat_incl IS NULL OR pvp.price_vat_incl = 0
ORDER BY p.code, pv.size_key;
