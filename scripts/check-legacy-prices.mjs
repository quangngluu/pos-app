// scripts/check-legacy-prices.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xolpfbadtfwsurzsjxts.supabase.co',
  'sb_secret_6rVN4QbW90bYOpoH0oWPPw_RJQfNQFQ'
);

async function main() {
  // Get legacy prices grouped by product
  const { data: legacyPrices } = await supabase
    .from('product_prices')
    .select('product_id, price_key, price_vat_incl');
  
  const pricesByProduct = {};
  legacyPrices?.forEach(p => {
    if (!pricesByProduct[p.product_id]) pricesByProduct[p.product_id] = {};
    pricesByProduct[p.product_id][p.price_key] = p.price_vat_incl;
  });
  
  // Get product info for these
  const productIds = Object.keys(pricesByProduct);
  const { data: products } = await supabase
    .from('products')
    .select('id, code, name, category_code, category')
    .in('id', productIds);
  
  console.log('Products with legacy prices (and their price_keys):');
  products?.slice(0, 30).forEach(p => {
    const prices = pricesByProduct[p.id];
    const cat = p.category_code || p.category;
    const keys = Object.keys(prices).join(', ');
    console.log(`  ${p.code} | ${cat} | keys=[${keys}]`);
  });
  
  // Count products with complete PHE+LA in legacy
  const withBothSizes = products?.filter(p => {
    const prices = pricesByProduct[p.id];
    return prices['SIZE_PHE'] && prices['SIZE_LA'];
  }).length || 0;
  
  console.log('\nProducts with both SIZE_PHE and SIZE_LA in legacy:', withBothSizes);
  
  // Check DRINK products specifically
  const drinkWithLegacy = products?.filter(p => {
    const cat = p.category_code || p.category;
    return cat === 'DRINK';
  }) || [];
  
  console.log('\nDRINK products with legacy prices:', drinkWithLegacy.length);
  drinkWithLegacy.slice(0, 20).forEach(p => {
    const prices = pricesByProduct[p.id];
    console.log(`  ${p.code}: PHE=${prices['SIZE_PHE'] || 'N/A'}, LA=${prices['SIZE_LA'] || 'N/A'}, STD=${prices['STD'] || 'N/A'}`);
  });
}

main().catch(console.error);
