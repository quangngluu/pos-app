-- Migration: Unified Promotion Scope Targets
-- Description: Create promotion_scope_targets table to unify category/product/variant targeting
-- Date: 2026-01-31

-- =====================================================
-- SECTION 1: CREATE UNIFIED SCOPE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.promotion_scope_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('CATEGORY', 'SUBCATEGORY', 'PRODUCT', 'VARIANT')),
  target_id TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_promotion_scope_targets_code 
    FOREIGN KEY (promotion_code) 
    REFERENCES public.promotions(code) 
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_promotion_scope_targets_promotion_code 
  ON public.promotion_scope_targets(promotion_code);

CREATE INDEX IF NOT EXISTS idx_promotion_scope_targets_target_type_id 
  ON public.promotion_scope_targets(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_promotion_scope_targets_included 
  ON public.promotion_scope_targets(promotion_code, is_included);

-- Add comment
COMMENT ON TABLE public.promotion_scope_targets IS 
  'Unified promotion targeting: supports CATEGORY, SUBCATEGORY, PRODUCT, and VARIANT level scoping with include/exclude';

-- =====================================================
-- SECTION 2: BACKFILL FROM EXISTING TABLES
-- =====================================================

-- Backfill from promotion_scopes (CATEGORY scopes)
DO $$
DECLARE
  v_backfill_count INTEGER := 0;
BEGIN
  -- Check if promotion_scopes table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'promotion_scopes'
  ) THEN
    -- Insert CATEGORY scopes
    INSERT INTO public.promotion_scope_targets (
      promotion_code,
      target_type,
      target_id,
      is_included
    )
    SELECT 
      promotion_code,
      'CATEGORY' AS target_type,
      category AS target_id,
      is_included
    FROM public.promotion_scopes
    WHERE scope_type = 'CATEGORY'
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_backfill_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % CATEGORY scopes from promotion_scopes', v_backfill_count;
  ELSE
    RAISE NOTICE 'Table promotion_scopes does not exist, skipping CATEGORY backfill';
  END IF;
END $$;

-- Backfill from promotion_targets (PRODUCT targets)
DO $$
DECLARE
  v_backfill_count INTEGER := 0;
BEGIN
  -- Check if promotion_targets table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'promotion_targets'
  ) THEN
    -- Insert PRODUCT targets (is_enabled maps to is_included)
    INSERT INTO public.promotion_scope_targets (
      promotion_code,
      target_type,
      target_id,
      is_included
    )
    SELECT 
      promotion_code,
      'PRODUCT' AS target_type,
      product_id::text AS target_id,
      is_enabled AS is_included
    FROM public.promotion_targets
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_backfill_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % PRODUCT targets from promotion_targets', v_backfill_count;
  ELSE
    RAISE NOTICE 'Table promotion_targets does not exist, skipping PRODUCT backfill';
  END IF;
END $$;

-- Backfill from promotion_target_variants (VARIANT targets)
DO $$
DECLARE
  v_backfill_count INTEGER := 0;
BEGIN
  -- Check if promotion_target_variants table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'promotion_target_variants'
  ) THEN
    -- Insert VARIANT targets (is_enabled maps to is_included)
    INSERT INTO public.promotion_scope_targets (
      promotion_code,
      target_type,
      target_id,
      is_included
    )
    SELECT 
      promotion_code,
      'VARIANT' AS target_type,
      variant_id::text AS target_id,
      is_enabled AS is_included
    FROM public.promotion_target_variants
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_backfill_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % VARIANT targets from promotion_target_variants', v_backfill_count;
  ELSE
    RAISE NOTICE 'Table promotion_target_variants does not exist, skipping VARIANT backfill';
  END IF;
END $$;

-- =====================================================
-- SECTION 3: UPDATE promotion_rules STRUCTURE
-- =====================================================

-- Ensure promotion_rules table exists with proper structure
CREATE TABLE IF NOT EXISTS public.promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code TEXT NOT NULL,
  rule_order INTEGER NOT NULL DEFAULT 0,
  conditions JSONB,
  actions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_promotion_rules_code 
    FOREIGN KEY (promotion_code) 
    REFERENCES public.promotions(code) 
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Add missing columns to existing table
DO $$
BEGIN
  -- Add rule_order column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'promotion_rules' 
    AND column_name = 'rule_order'
  ) THEN
    ALTER TABLE public.promotion_rules ADD COLUMN rule_order INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added rule_order column to promotion_rules';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'promotion_rules' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.promotion_rules ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    RAISE NOTICE 'Added created_at column to promotion_rules';
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'promotion_rules' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.promotion_rules ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    RAISE NOTICE 'Added updated_at column to promotion_rules';
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_promotion_rules_promotion_code 
  ON public.promotion_rules(promotion_code);

CREATE INDEX IF NOT EXISTS idx_promotion_rules_order 
  ON public.promotion_rules(promotion_code, rule_order);

-- Add comment with rule contract
COMMENT ON TABLE public.promotion_rules IS 
  'Promotion rules with conditions and actions.
  
CONDITIONS (JSONB):
  - min_order_value: number (e.g., 200000)
  - min_qty: number (e.g., 5 - total items in order)
  - min_eligible_qty: number (e.g., 5 - items matching scope)
  
ACTIONS (JSONB array):
  - PERCENT_OFF: {"type":"PERCENT_OFF","percent":10,"apply_to":"ELIGIBLE_LINES"}
  - AMOUNT_OFF: {"type":"AMOUNT_OFF","amount":20000,"apply_to":"ORDER_TOTAL"|"ELIGIBLE_LINES","allocation":"PROPORTIONAL"}
  - AMOUNT_OFF_PER_ITEM: {"type":"AMOUNT_OFF_PER_ITEM","amount":5000,"max_items":5}
  - FREE_ITEM: {"type":"FREE_ITEM","variant_id":"<uuid>","qty":1,"max_per_order":1}
  ';

-- =====================================================
-- SECTION 4: GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON public.promotion_scope_targets TO anon, authenticated;
GRANT SELECT ON public.promotion_rules TO anon, authenticated;

-- =====================================================
-- SECTION 5: VALIDATION
-- =====================================================

DO $$
DECLARE
  v_target_count INTEGER;
  v_rules_count INTEGER;
  v_promotions_count INTEGER;
BEGIN
  -- Count data
  SELECT COUNT(*) INTO v_target_count FROM public.promotion_scope_targets;
  SELECT COUNT(*) INTO v_rules_count FROM public.promotion_rules;
  SELECT COUNT(*) INTO v_promotions_count FROM public.promotions;
  
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'PROMOTION SCOPE TARGETS MIGRATION COMPLETE';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Active promotions: %', v_promotions_count;
  RAISE NOTICE 'Scope targets: %', v_target_count;
  RAISE NOTICE 'Rules defined: %', v_rules_count;
  RAISE NOTICE '========================================================';
END $$;
