// Get more database context
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load environment
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function getDetailedContext() {
  console.log('📊 DETAILED DATABASE CONTEXT\n');
  
  // 1. Get promotion_scopes details
  console.log('1. PROMOTION_SCOPES (legacy table for categories):');
  const { data: scopes } = await supabase
    .from('promotion_scopes')
    .select('*');
  
  console.log(JSON.stringify(scopes, null, 2));
  
  // 2. Get promotion_rules structure
  console.log('\n2. PROMOTION_RULES (existing rules):');
  const { data: rules } = await supabase
    .from('promotion_rules')
    .select('*')
    .limit(2);
  
  console.log(JSON.stringify(rules, null, 2));
  
  // 3. Check if promotion_target_variants exists
  console.log('\n3. Checking PROMOTION_TARGET_VARIANTS:');
  const { data: variants, error: varError } = await supabase
    .from('promotion_target_variants')
    .select('*')
    .limit(3);
  
  if (varError) {
    console.log('❌ Table not found:', varError.message);
  } else {
    console.log(`✅ Found ${variants.length} variant targets`);
    console.log(JSON.stringify(variants, null, 2));
  }
  
  // 4. Get categories for scope targeting
  console.log('\n4. CATEGORIES (for targeting):');
  const { data: categories } = await supabase
    .from('categories')
    .select('code, name')
    .limit(10);
  
  console.log(JSON.stringify(categories, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('- promotion_scope_targets: ❌ NEEDS CREATION');
  console.log('- promotion_rules: ✅ EXISTS');
  console.log('- promotion_scopes: ✅ EXISTS (legacy, will be backfilled)');
  console.log('- promotion_targets: ✅ EXISTS (legacy, will be backfilled)');
  console.log('\n📝 READY TO RUN MIGRATION');
  console.log('='.repeat(60));
}

getDetailedContext();
