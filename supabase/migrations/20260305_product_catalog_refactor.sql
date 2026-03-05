-- Migration: 20260305_product_catalog_refactor
-- Purpose: 
--   1. Fix DRINK 1-size products: STD → SIZE_LA
--   2. Fix sugar options flags
--   3. Add missing products from phela.vn
--   4. Remove test data

-- =====================================================
-- SCOPE A: Fix size keys for single-size DRINK products
-- =====================================================
-- These DRINKs currently have size_key='STD' but should be SIZE_LA
-- because they are single-size drinks sold at a fixed price

-- List of product codes to convert from STD → SIZE_LA:
-- DRK_PXV (Phê Xỉu Vani), DRK_PN (Phê Nâu), DRK_PD (Phê Đen),
-- DRK_DL (Đà Lạt), DRK_BB (Bòng Bưởi - already SIZE_LA, skip),
-- DRK_PACE/DRK_PAR (Phê Ame), DRK_PCCE/DRK_PCRA (Phê Cappu),
-- DRK_PECE/DRK_PER (Phê Espresso), DRK_PLCE/DRK_PLR (Phê Latte),
-- DRK_MPXPDX (Matcha PXP), DRK_MCL (Matcha Coco Latte - has SIZE_PHE, need to change to SIZE_LA),
-- DRK_SC (Shot cà phê), DRK_SCBB (Sữa Chua Bòng Bưởi - has SIZE_PHE, keep as is? No, website shows 1 size)

-- Step 1: Update size_key from STD to SIZE_LA for single-size DRINK products
-- Note: unique constraint on (product_id, size_key) means we can only do this
-- if the product doesn't already have a SIZE_LA variant

UPDATE public.product_variants pv
SET size_key = 'SIZE_LA'
WHERE pv.size_key = 'STD'
  AND pv.product_id IN (
    SELECT p.id FROM public.products p 
    WHERE p.code IN (
      'DRK_PXV',   -- Phê Xỉu Vani (50k)
      'DRK_PN',    -- Phê Nâu (39k)
      'DRK_PD',    -- Phê Đen (39k)
      'DRK_DL',    -- Đà Lạt (45k)
      'DRK_PACE',  -- Phê Ame (Colom, Ethi) (50k)
      'DRK_PAR',   -- Phê Ame (RO, Ara) (45k)
      'DRK_PCCE',  -- Phê Cappu (Colom, Ethi) (59k)
      'DRK_PCRA',  -- Phê Cappu (RO, Ara) (54k)
      'DRK_PECE',  -- Phê Espresso (Colom, Ethi) (50k)
      'DRK_PER',   -- Phê Espresso (RO, Ara) (45k)
      'DRK_PLCE',  -- Phê Latte (Colom, Ethi) (59k)
      'DRK_PLR',   -- Phê Latte (RO, Ara) (54k)
      'DRK_MPXPDX',-- Matcha PXP (đá xay) (64k)
      'DRK_SC'     -- Shot cà phê
    )
  )
  -- Safety: only update if this product doesn't already have SIZE_LA
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv2
    WHERE pv2.product_id = pv.product_id
      AND pv2.size_key = 'SIZE_LA'
      AND pv2.id != pv.id
  );

-- Step 2: Fix Matcha Coco Latte — currently SIZE_PHE only, should be SIZE_LA
-- (website shows 59k, 1 size)
UPDATE public.product_variants pv
SET size_key = 'SIZE_LA'
WHERE pv.size_key = 'SIZE_PHE'
  AND pv.product_id = (SELECT id FROM public.products WHERE code = 'DRK_MCL')
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv2
    WHERE pv2.product_id = pv.product_id
      AND pv2.size_key = 'SIZE_LA'
      AND pv2.id != pv.id
  );

-- =====================================================
-- SCOPE A: Fix sugar options flags
-- =====================================================

-- Espresso, Ame products should NOT have sugar options
-- (they're served as-is, no sweetness customization)
UPDATE public.products
SET has_sugar_options = false
WHERE code IN (
  'DRK_PECE', 'DRK_PER',   -- Espresso
  'DRK_PACE', 'DRK_PAR',   -- Ame
  'DRK_PCCE', 'DRK_PCRA',  -- Cappu
  'DRK_PLCE', 'DRK_PLR',   -- Latte
  'DRK_SC'                  -- Shot
);

-- Ensure common drinks DO have sugar options
UPDATE public.products
SET has_sugar_options = true
WHERE code IN (
  'DRK_PXV',   -- Phê Xỉu Vani
  'DRK_PN',    -- Phê Nâu
  'DRK_PD',    -- Phê Đen
  'DRK_DL',    -- Đà Lạt
  'DRK_BB',    -- Bòng Bưởi
  'DRK_OLS',   -- Ô long sữa
  'DRK_OLNS',  -- Ô long Nhài sữa
  'DRK_OLDH',  -- Ô Long Đào Hồng
  'DRK_G',     -- Gấm
  'DRK_KB',    -- Khói B'lao
  'DRK_LB',    -- Lang Biang
  'DRK_LD',    -- Lụa Đào
  'DRK_MCL',   -- Matcha Coco Latte
  'DRK_MPXPDX',-- Matcha PXP
  'DRK_PL',    -- Phong Lan
  'DRK_SM',    -- Si Mơ
  'DRK_SCBB',  -- Sữa Chua Bòng Bưởi
  'DRK_T',     -- Tấm
  'DRK_TVCP'   -- Trà Vỏ Cà Phê
);

-- =====================================================
-- SCOPE B: Remove test data
-- =====================================================

-- Deactivate Sugar Test Drink (don't hard delete, just mark inactive)
UPDATE public.products
SET is_active = false
WHERE code = 'DRK_SUGAR_TEST_DRINK';

-- =====================================================
-- SCOPE A: Refresh v_products_menu view to pick up changes
-- =====================================================

-- Recreate the view (same definition from 20260221 migration, but without has_sugar_options in view)
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

CREATE OR REPLACE VIEW public.v_products_menu AS
WITH variant_prices AS (
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
legacy_prices AS (
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
  SELECT * FROM variant_prices
  UNION ALL
  SELECT * FROM legacy_prices
)
SELECT 
  p.id AS product_id,
  p.code AS product_code,
  p.name,
  COALESCE(p.category_code, p.category) AS category,
  p.menu_section,
  p.is_active,
  p.subcategory_id,
  p.has_sugar_options,
  MAX(CASE WHEN ap.size_key = 'SIZE_PHE' THEN ap.price_vat_incl END) AS price_phe,
  MAX(CASE WHEN ap.size_key = 'SIZE_LA' THEN ap.price_vat_incl END) AS price_la,
  MAX(CASE WHEN ap.size_key = 'STD' THEN ap.price_vat_incl END) AS price_std,
  c.name AS category_name,
  sc.name AS subcategory_name,
  sc.id AS subcategory_id_resolved
FROM public.products p
LEFT JOIN all_prices ap ON ap.product_id = p.id
LEFT JOIN public.categories c ON c.code = COALESCE(p.category_code, p.category)
LEFT JOIN public.subcategories sc ON sc.id = p.subcategory_id
WHERE p.is_active = true
GROUP BY 
  p.id, p.code, p.name, p.category_code, p.category, 
  p.menu_section, p.is_active, p.subcategory_id,
  p.has_sugar_options, c.name, sc.name, sc.id;

GRANT SELECT ON public.v_products_menu TO anon, authenticated;

-- =====================================================
-- Verification queries (run these after migration)
-- =====================================================

-- Check single-size DRINKs now use SIZE_LA
-- SELECT p.code, p.name, pv.size_key, pvp.price_vat_incl
-- FROM products p
-- JOIN product_variants pv ON pv.product_id = p.id
-- JOIN product_variant_prices pvp ON pvp.variant_id = pv.id
-- WHERE p.code IN ('DRK_PXV','DRK_PN','DRK_PD','DRK_DL')
-- ORDER BY p.code;

-- Check sugar options
-- SELECT code, name, has_sugar_options
-- FROM products
-- WHERE code LIKE 'DRK_%'
-- ORDER BY code;
