// scripts/verify-root-cause.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xolpfbadtfwsurzsjxts.supabase.co',
  'sb_secret_6rVN4QbW90bYOpoH0oWPPw_RJQfNQFQ'
);

async function main() {
  // Verify product_variants is empty
  const { count: variantCount } = await supabase
    .from('product_variants')
    .select('*', { count: 'exact', head: true });
  console.log('product_variants count:', variantCount);
  
  // Check product_prices price_key values
  const { data: priceKeys } = await supabase
    .from('product_prices')
    .select('price_key');
  
  const keySet = new Set(priceKeys?.map(p => p.price_key) || []);
  console.log('Distinct price_key values in product_prices:', [...keySet]);
  
  // Test what view returns for a known DRINK product
  const { data: viewSample } = await supabase
    .from('v_products_menu')
    .select('product_code, name, category, price_phe, price_la, price_std')
    .eq('product_code', 'DRK_OLS')
    .maybeSingle();
  
  console.log('\nView result for DRK_OLS (should have PHE=54000, LA=69000):');
  console.log(viewSample);
  
  // Direct legacy lookup for same product
  const { data: legacyForOLS } = await supabase
    .from('products')
    .select('id')
    .eq('code', 'DRK_OLS')
    .maybeSingle();
  
  if (legacyForOLS) {
    const { data: legacyPrices } = await supabase
      .from('product_prices')
      .select('price_key, price_vat_incl')
      .eq('product_id', legacyForOLS.id);
    
    console.log('\nLegacy prices for DRK_OLS:');
    legacyPrices?.forEach(p => console.log(`  ${p.price_key}: ${p.price_vat_incl}`));
  }
}

main().catch(console.error);
