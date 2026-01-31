-- Test Data Setup for Promotion Scope Matching
-- Run this in Supabase SQL Editor to create test promotions

-- ============================================
-- Test 1: DISCOUNT with DRINK category only
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_DRINK10', 'Test: 10% Off Drinks', 'DISCOUNT', 10, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

INSERT INTO public.promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES ('TEST_DRINK10', 'CATEGORY', 'DRINK', true)
ON CONFLICT (promotion_code, scope_type, category) DO UPDATE SET
  is_included = EXCLUDED.is_included;

-- ============================================
-- Test 2: DISCOUNT with no scopes (apply NONE)
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_NONE', 'Test: No Scope Discount', 'DISCOUNT', 15, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

-- NO scopes inserted for this promotion
DELETE FROM public.promotion_scopes WHERE promotion_code = 'TEST_NONE';

-- ============================================
-- Test 3: DISCOUNT with TOPPING only
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_TOP10', 'Test: 10% Off Toppings', 'DISCOUNT', 10, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

INSERT INTO public.promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES ('TEST_TOP10', 'CATEGORY', 'TOPPING', true)
ON CONFLICT (promotion_code, scope_type, category) DO UPDATE SET
  is_included = EXCLUDED.is_included;

-- ============================================
-- Test 4: DISCOUNT with mixed categories
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_MIXED20', 'Test: 20% Off Drinks + Cake', 'DISCOUNT', 20, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

DELETE FROM public.promotion_scopes 
WHERE promotion_code = 'TEST_MIXED20' AND scope_type = 'CATEGORY';

INSERT INTO public.promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES 
  ('TEST_MIXED20', 'CATEGORY', 'DRINK', true),
  ('TEST_MIXED20', 'CATEGORY', 'CAKE', true);

-- ============================================
-- Test 5: DISCOUNT with excluded category
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_NO_TOP', 'Test: All Except Toppings', 'DISCOUNT', 15, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

DELETE FROM public.promotion_scopes 
WHERE promotion_code = 'TEST_NO_TOP' AND scope_type = 'CATEGORY';

INSERT INTO public.promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES 
  ('TEST_NO_TOP', 'CATEGORY', 'DRINK', true),
  ('TEST_NO_TOP', 'CATEGORY', 'TOPPING', false); -- excluded

-- ============================================
-- Test 6: Expired promotion (time window)
-- ============================================
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable, valid_from, valid_until)
VALUES ('TEST_EXPIRED', 'Test: Expired Promo', 'DISCOUNT', 25, 0, true, false, '2026-01-01', '2026-01-15')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  valid_until = EXCLUDED.valid_until,
  is_active = EXCLUDED.is_active;

INSERT INTO public.promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES ('TEST_EXPIRED', 'CATEGORY', 'DRINK', true)
ON CONFLICT (promotion_code, scope_type, category) DO UPDATE SET
  is_included = EXCLUDED.is_included;

-- ============================================
-- Test 7: PRODUCT targets (specific products)
-- ============================================
-- Note: Replace <product-uuid-1> and <product-uuid-2> with actual UUIDs from your products table

-- First, get some product UUIDs:
-- SELECT id, code, name, category FROM products WHERE category = 'DRINK' LIMIT 3;

-- Example (replace UUIDs):
/*
INSERT INTO public.promotions (code, name, promo_type, percent_off, priority, is_active, is_stackable)
VALUES ('TEST_SPECIFIC', 'Test: Specific Products Only', 'DISCOUNT', 30, 0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off,
  is_active = EXCLUDED.is_active;

-- NO category scopes for this promotion
DELETE FROM public.promotion_scopes WHERE promotion_code = 'TEST_SPECIFIC';

-- Add product targets
INSERT INTO public.promotion_targets (promotion_code, product_id, is_enabled)
VALUES 
  ('TEST_SPECIFIC', '<espresso-uuid-here>', true),
  ('TEST_SPECIFIC', '<latte-uuid-here>', true)
ON CONFLICT (promotion_code, product_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled;
*/

-- ============================================
-- Cleanup (optional - removes all test data)
-- ============================================
/*
DELETE FROM public.promotion_targets WHERE promotion_code LIKE 'TEST_%';
DELETE FROM public.promotion_scopes WHERE promotion_code LIKE 'TEST_%';
DELETE FROM public.promotions WHERE code LIKE 'TEST_%';
*/

-- ============================================
-- Verification Queries
-- ============================================

-- Check created promotions
SELECT code, name, promo_type, percent_off, valid_from, valid_until, is_active
FROM public.promotions
WHERE code LIKE 'TEST_%'
ORDER BY code;

-- Check scopes
SELECT promotion_code, scope_type, category, is_included
FROM public.promotion_scopes
WHERE promotion_code LIKE 'TEST_%'
ORDER BY promotion_code, category;

-- Check product targets (if any)
SELECT pt.promotion_code, p.code as product_code, p.name as product_name, pt.is_enabled
FROM public.promotion_targets pt
JOIN public.products p ON pt.product_id = p.id
WHERE pt.promotion_code LIKE 'TEST_%'
ORDER BY pt.promotion_code;

-- Check product categories (to understand what to test with)
SELECT DISTINCT category, COUNT(*) as product_count
FROM public.products
WHERE is_active = true
GROUP BY category
ORDER BY category;
