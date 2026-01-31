import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Testing Database Requirements\n');

// Test 1: Nearest Store Function
console.log('1️⃣ Testing nearest_store function...');
const { data: nearestStores, error: nearestError } = await supabase.rpc('nearest_store', {
  p_lat: 10.7831855,
  p_lng: 106.695983,
  limit_n: 3
});

if (nearestError) {
  console.log('   ❌ ERROR:', nearestError.message);
} else {
  console.log(`   ✅ Found ${nearestStores.length} stores`);
  nearestStores.forEach((s, i) => {
    console.log(`      ${i + 1}. ${s.name} - ${Math.round(s.distance_m)}m`);
  });
}

// Test 2: Products with Categories
console.log('\n2️⃣ Testing products with categories...');
const { data: products, error: prodError } = await supabase
  .from('products')
  .select('id, code, name, category_code, subcategory_id, is_active')
  .eq('is_active', true)
  .limit(5);

if (prodError) {
  console.log('   ❌ ERROR:', prodError.message);
} else {
  console.log(`   ✅ Found ${products.length} active products`);
  products.forEach(p => {
    console.log(`      - ${p.name} (${p.category_code || 'no category'})`);
  });
}

// Test 3: Categories Table
console.log('\n3️⃣ Testing categories table...');
const { data: categories, error: catError } = await supabase
  .from('categories')
  .select('code, name, is_active')
  .eq('is_active', true)
  .order('sort_order');

if (catError) {
  console.log('   ❌ ERROR:', catError.message);
} else {
  console.log(`   ✅ Found ${categories.length} categories`);
  categories.forEach(c => {
    console.log(`      - ${c.code}: ${c.name}`);
  });
}

// Test 4: Product Variants
console.log('\n4️⃣ Testing product_variants table...');
const { data: variants, error: varError } = await supabase
  .from('product_variants')
  .select('id, product_id, size_key, sku_code, is_active')
  .eq('is_active', true)
  .limit(5);

if (varError) {
  console.log('   ❌ ERROR:', varError.message);
} else {
  console.log(`   ✅ Found ${variants?.length || 0} variants`);
  if (variants && variants.length > 0) {
    variants.forEach(v => {
      console.log(`      - SKU: ${v.sku_code} (${v.size_key})`);
    });
  }
}

// Test 5: v_products_menu View
console.log('\n5️⃣ Testing v_products_menu view...');
const { data: menuProducts, error: menuError } = await supabase
  .from('v_products_menu')
  .select('product_code, name, category, price_std, price_phe, price_la')
  .limit(5);

if (menuError) {
  console.log('   ❌ ERROR:', menuError.message);
} else {
  console.log(`   ✅ View working with ${menuProducts.length} products`);
  menuProducts.forEach(p => {
    const prices = [];
    if (p.price_std) prices.push(`STD: ${p.price_std}`);
    if (p.price_phe) prices.push(`PHE: ${p.price_phe}`);
    if (p.price_la) prices.push(`LA: ${p.price_la}`);
    console.log(`      - ${p.name}: ${prices.join(', ')}`);
  });
}

// Test 6: Stores with Coordinates
console.log('\n6️⃣ Testing stores table with spatial data...');
const { data: stores, error: storeError } = await supabase
  .from('stores')
  .select('id, name, lat, lng')
  .not('lat', 'is', null)
  .not('lng', 'is', null)
  .limit(5);

if (storeError) {
  console.log('   ❌ ERROR:', storeError.message);
} else {
  console.log(`   ✅ Found ${stores.length} stores with coordinates`);
  stores.forEach(s => {
    console.log(`      - ${s.name}: (${s.lat}, ${s.lng})`);
  });
}

// Test 7: Promotions
console.log('\n7️⃣ Testing promotions table...');
const { data: promotions, error: promoError } = await supabase
  .from('promotions')
  .select('code, name, is_active, promo_type, percent_off')
  .eq('is_active', true)
  .limit(3);

if (promoError) {
  console.log('   ❌ ERROR:', promoError.message);
} else {
  console.log(`   ✅ Found ${promotions?.length || 0} active promotions`);
  if (promotions && promotions.length > 0) {
    promotions.forEach(p => {
      console.log(`      - ${p.name} (${p.promo_type}: ${p.percent_off}%)`);
    });
  }
}

console.log('\n' + '='.repeat(50));
console.log('✅ Database Requirements Test Complete!');
console.log('='.repeat(50));
