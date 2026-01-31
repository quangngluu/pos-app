// scripts/apply-and-verify-fix.mjs
// Run: node scripts/apply-and-verify-fix.mjs
//
// This script:
// 1. Recreates the v_products_menu view with corrected CASE mapping
// 2. Verifies the fix worked

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xolpfbadtfwsurzsjxts.supabase.co',
  'sb_secret_6rVN4QbW90bYOpoH0oWPPw_RJQfNQFQ'
);

const FIXED_VIEW_SQL = `
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
      WHEN pp.price_key = 'STD' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'SIZE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'SIZE_LA' THEN 'SIZE_LA'::public.size_key
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
      ELSE 'STD'::public.size_key
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
),
all_prices AS (
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
  p.id, p.code, p.name, p.category_code, p.category, p.menu_section, 
  p.is_active, p.subcategory_id, c.name, sc.name, sc.id;

GRANT SELECT ON public.v_products_menu TO anon, authenticated;
`;

async function main() {
  console.log('\n=== APPLYING VIEW FIX ===\n');

  // Apply the fix via RPC (need to use raw SQL)
  const { error: applyError } = await supabase.rpc('exec_sql', { sql: FIXED_VIEW_SQL });
  
  if (applyError) {
    // RPC might not exist, try alternative approach
    console.log('RPC not available, testing view as-is...');
  } else {
    console.log('✅ View fix applied via RPC');
  }

  // Verify the fix
  console.log('\n=== VERIFYING FIX ===\n');

  // Test DRK_OLS specifically
  const { data: olsData } = await supabase
    .from('v_products_menu')
    .select('product_code, name, price_phe, price_la, price_std')
    .eq('product_code', 'DRK_OLS')
    .maybeSingle();

  console.log('DRK_OLS (should have PHE=54000, LA=69000):');
  console.log('  price_phe:', olsData?.price_phe, olsData?.price_phe === 54000 ? '✅' : '❌');
  console.log('  price_la:', olsData?.price_la, olsData?.price_la === 69000 ? '✅' : '❌');
  console.log('  price_std:', olsData?.price_std);

  // Count DRINK products with proper prices
  const { data: drinkData } = await supabase
    .from('v_products_menu')
    .select('product_code, price_phe, price_la, price_std')
    .eq('category', 'DRINK');

  const withPhe = drinkData?.filter(d => d.price_phe !== null).length || 0;
  const withLa = drinkData?.filter(d => d.price_la !== null).length || 0;
  const withBoth = drinkData?.filter(d => d.price_phe !== null && d.price_la !== null).length || 0;
  const withStdOnly = drinkData?.filter(d => d.price_phe === null && d.price_la === null && d.price_std !== null).length || 0;

  console.log('\nDRINK products summary:');
  console.log('  Total:', drinkData?.length || 0);
  console.log('  With price_phe:', withPhe);
  console.log('  With price_la:', withLa);
  console.log('  With BOTH PHE+LA:', withBoth);
  console.log('  STD-only (Plus items):', withStdOnly);

  // Sample of products with both sizes
  console.log('\nSample DRINK products with BOTH sizes:');
  drinkData?.filter(d => d.price_phe !== null && d.price_la !== null)
    .slice(0, 5)
    .forEach(d => {
      console.log(`  ${d.product_code}: PHE=${d.price_phe}, LA=${d.price_la}`);
    });

  // Sample of STD-only products (Plus items)
  console.log('\nSample STD-only products (Plus items):');
  drinkData?.filter(d => d.price_phe === null && d.price_la === null && d.price_std !== null)
    .slice(0, 5)
    .forEach(d => {
      console.log(`  ${d.product_code}: STD=${d.price_std}`);
    });

  console.log('\n=== FIX VERIFICATION COMPLETE ===\n');
}

main().catch(console.error);
