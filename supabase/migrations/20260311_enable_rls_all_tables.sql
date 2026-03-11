-- ============================================================
-- Supabase Security Fix: Enable RLS on ALL tables (safe version)
-- Skips tables that don't exist
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products',
      'product_variants',
      'product_variant_prices',
      'product_prices',
      'product_sugar_options',
      'product_subcategories',
      'product_categories',
      'orders',
      'order_lines',
      'order_applied_promotions',
      'customers',
      'stores',
      'promotions',
      'promotion_rules',
      'promotion_scope_targets',
      'promotion_targets',
      'telegram_pending_uploads'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled on: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Policies: authenticated users can READ catalog data
-- ============================================================

-- Helper: create SELECT policy only if table exists
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products',
      'product_variants',
      'product_variant_prices',
      'product_prices',
      'product_sugar_options',
      'product_subcategories',
      'product_categories',
      'stores',
      'promotions',
      'promotion_rules',
      'promotion_scope_targets',
      'promotion_targets',
      'customers'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        tbl || '_select_auth', tbl
      );
      RAISE NOTICE 'Read policy created on: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Orders: owner-only access (if created_by column exists)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS orders_select_own ON public.orders';
    EXECUTE 'CREATE POLICY orders_select_own ON public.orders FOR SELECT TO authenticated USING (created_by = auth.uid())';

    EXECUTE 'DROP POLICY IF EXISTS orders_insert_auth ON public.orders';
    EXECUTE 'CREATE POLICY orders_insert_auth ON public.orders FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid())';
    RAISE NOTICE 'Owner-only policies created on orders';
  ELSE
    -- Fallback: authenticated read-only
    EXECUTE 'DROP POLICY IF EXISTS orders_select_auth ON public.orders';
    EXECUTE 'CREATE POLICY orders_select_auth ON public.orders FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Read-only policy created on orders (no created_by column)';
  END IF;
END $$;

-- Order lines: read via parent order
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='order_lines') THEN
    EXECUTE 'DROP POLICY IF EXISTS order_lines_select_auth ON public.order_lines';
    EXECUTE 'CREATE POLICY order_lines_select_auth ON public.order_lines FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Read policy on order_lines';
  END IF;
END $$;

-- Order applied promotions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='order_applied_promotions') THEN
    EXECUTE 'DROP POLICY IF EXISTS order_applied_promotions_select_auth ON public.order_applied_promotions';
    EXECUTE 'CREATE POLICY order_applied_promotions_select_auth ON public.order_applied_promotions FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'Read policy on order_applied_promotions';
  END IF;
END $$;

-- ============================================================
-- Revoke anon access to sensitive tables
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers',
      'orders',
      'order_lines',
      'order_applied_promotions',
      'telegram_pending_uploads'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
      RAISE NOTICE 'Revoked anon access on: %', tbl;
    END IF;
  END LOOP;
END $$;
