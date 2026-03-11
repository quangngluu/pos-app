-- ============================================================
-- Security Fix Part 2: Fix remaining 20 errors
-- 4 SECURITY DEFINER views + 16 tables without RLS
-- ============================================================

-- ============================================================
-- A. Fix SECURITY DEFINER views → change to SECURITY INVOKER
-- ============================================================

ALTER VIEW public.v_products_menu SET (security_invoker = on);
ALTER VIEW public.v_product_skus_compat SET (security_invoker = on);
ALTER VIEW public.v_product_prices_compat SET (security_invoker = on);
ALTER VIEW public.v_product_sugar_options SET (security_invoker = on);

-- ============================================================
-- B. Enable RLS on remaining 16 tables
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'price_overrides',
      'option_groups',
      'option_values',
      'product_option_values',
      'stg_product_sku_section',
      'stg_products',
      'stg_product_prices',
      'stg_price_overrides',
      'product_skus',
      'stg_products_sku_section',
      'stg_product_sugar_options',
      -- 'spatial_ref_sys' — PostGIS system table, cannot alter (owned by extension)
      'promotion_scopes',
      'categories',
      'subcategories',
      'promotion_target_variants'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      -- Read-only for authenticated users
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        tbl || '_select_auth', tbl
      );
      RAISE NOTICE 'RLS enabled + read policy on: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', tbl;
    END IF;
  END LOOP;
END $$;
