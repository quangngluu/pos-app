// scripts/run-diagnostics.mjs
// Run with: node scripts/run-diagnostics.mjs

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xolpfbadtfwsurzsjxts.supabase.co';
const supabaseServiceKey = 'sb_secret_6rVN4QbW90bYOpoH0oWPPw_RJQfNQFQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runDiagnostics() {
  console.log('\n=== SIZE SYNC DIAGNOSTICS ===\n');

  // 1. Counts
  console.log('--- SECTION 1: COUNTS ---\n');

  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
  console.log('Total active products:', totalProducts);

  const { data: variantProducts } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('is_active', true);
  const uniqueProductsWithVariants = new Set(variantProducts?.map(v => v.product_id) || []).size;
  console.log('Products with >=1 variant:', uniqueProductsWithVariants);

  const { count: drinkProductsTotal } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .or('category_code.eq.DRINK,category.eq.DRINK');
  console.log('DRINK products total:', drinkProductsTotal);

  // Find DRINK products and check if they have SIZE_PHE and SIZE_LA
  const { data: drinkProducts } = await supabase
    .from('products')
    .select('id, code, name, category_code, category')
    .eq('is_active', true)
    .or('category_code.eq.DRINK,category.eq.DRINK');

  const { data: allVariants } = await supabase
    .from('product_variants')
    .select('product_id, size_key')
    .eq('is_active', true);

  const variantsByProduct = {};
  allVariants?.forEach(v => {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v.size_key);
  });

  const drinksMissingPheOrLa = drinkProducts?.filter(p => {
    const sizes = variantsByProduct[p.id] || [];
    return !sizes.includes('SIZE_PHE') || !sizes.includes('SIZE_LA');
  }) || [];
  console.log('DRINK products missing SIZE_PHE or SIZE_LA:', drinksMissingPheOrLa.length);

  // Variants missing prices
  const { data: allActiveVariants } = await supabase
    .from('product_variants')
    .select('id, product_id, size_key, sku_code')
    .eq('is_active', true);

  const { data: allPrices } = await supabase
    .from('product_variant_prices')
    .select('variant_id, price_vat_incl');

  const pricesByVariant = {};
  allPrices?.forEach(p => { pricesByVariant[p.variant_id] = p.price_vat_incl; });

  const variantsMissingPrices = allActiveVariants?.filter(v => pricesByVariant[v.id] === undefined) || [];
  console.log('Variants missing prices:', variantsMissingPrices.length);

  // 2. Sample problematic rows
  console.log('\n--- SECTION 2: SAMPLE PROBLEMATIC ROWS ---\n');

  // Get view data
  const { data: viewData } = await supabase
    .from('v_products_menu')
    .select('*')
    .or('category.eq.DRINK,category.ilike.%DRINK%');

  console.log('DRINK products in view with NULL price_phe or price_la:');
  const viewProblems = viewData?.filter(v => v.price_phe === null || v.price_la === null) || [];
  viewProblems.slice(0, 20).forEach(p => {
    const sizes = variantsByProduct[p.product_id] || [];
    console.log(`  - ${p.name} (${p.product_code}): price_phe=${p.price_phe}, price_la=${p.price_la}, variants=[${sizes.join(',')}]`);
  });

  if (variantsMissingPrices.length > 0) {
    console.log('\nVariants with missing prices (sample 20):');
    const { data: productInfo } = await supabase
      .from('products')
      .select('id, code, name')
      .in('id', variantsMissingPrices.slice(0, 20).map(v => v.product_id));
    const productMap = {};
    productInfo?.forEach(p => { productMap[p.id] = p; });
    
    variantsMissingPrices.slice(0, 20).forEach(v => {
      const p = productMap[v.product_id];
      console.log(`  - ${p?.name || 'unknown'} (${p?.code || v.product_id}): size=${v.size_key}, sku=${v.sku_code}`);
    });
  }

  // 3. Get current view definition
  console.log('\n--- SECTION 3: CURRENT VIEW DEFINITION ---\n');
  const { data: viewDef } = await supabase.rpc('get_view_definition', { view_name: 'v_products_menu' }).maybeSingle();
  if (viewDef) {
    console.log('View definition:');
    console.log(viewDef);
  } else {
    // Fallback: query pg_views directly via raw SQL in another way
    const { data: pgViews } = await supabase
      .from('pg_views')
      .select('definition')
      .eq('viewname', 'v_products_menu')
      .eq('schemaname', 'public')
      .maybeSingle();
    if (pgViews) {
      console.log('View definition (from pg_views):');
      console.log(pgViews.definition);
    } else {
      console.log('Could not retrieve view definition. Please check manually in Supabase dashboard.');
    }
  }

  // 4. Legacy data check
  console.log('\n--- SECTION 4: LEGACY DATA CHECK ---\n');
  const { data: legacyPrices } = await supabase
    .from('product_prices')
    .select('product_id, price_key, price_vat_incl');
  
  console.log('Legacy product_prices entries:', legacyPrices?.length || 0);
  
  // Group by price_key
  const legacyByKey = {};
  legacyPrices?.forEach(p => {
    legacyByKey[p.price_key] = (legacyByKey[p.price_key] || 0) + 1;
  });
  console.log('Legacy prices by key:', legacyByKey);

  // Find products that have legacy prices but NO variants
  const productIdsWithVariants = new Set(allActiveVariants?.map(v => v.product_id) || []);
  const legacyOnlyProducts = legacyPrices?.filter(p => !productIdsWithVariants.has(p.product_id)) || [];
  const uniqueLegacyOnly = new Set(legacyOnlyProducts.map(p => p.product_id)).size;
  console.log('Products with legacy prices but NO variants:', uniqueLegacyOnly);

  // Summary for fixing
  console.log('\n--- SUMMARY FOR FIX ---\n');
  console.log('1. DRINK products missing variants:', drinksMissingPheOrLa.length);
  console.log('2. Variants missing prices:', variantsMissingPrices.length);
  console.log('3. Products using legacy-only pricing:', uniqueLegacyOnly);
  console.log('4. View entries with NULL PHE/LA:', viewProblems.length);

  // List DRINK products that need variants
  if (drinksMissingPheOrLa.length > 0) {
    console.log('\nDRINK products needing SIZE_PHE/SIZE_LA variants (first 30):');
    drinksMissingPheOrLa.slice(0, 30).forEach(p => {
      const sizes = variantsByProduct[p.id] || [];
      const needsPhe = !sizes.includes('SIZE_PHE');
      const needsLa = !sizes.includes('SIZE_LA');
      console.log(`  - ${p.code}: ${p.name} | has=[${sizes.join(',')}] | needs=[${needsPhe?'SIZE_PHE':''}${needsPhe&&needsLa?',':''}${needsLa?'SIZE_LA':''}]`);
    });
  }
}

runDiagnostics().catch(console.error);
