// Check database state and run migration
const fs = require('fs');

// Import your existing Supabase setup
const { createClient } = require('@supabase/supabase-js');

// Load environment from .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDatabase() {
  console.log('🔍 Checking database state...\n');
  
  try {
    // Check if tables exist
    console.log('1. Checking promotions table...');
    const { data: promotions, error: promoError } = await supabase
      .from('promotions')
      .select('code, name, promo_type')
      .limit(5);
    
    if (promoError) {
      console.error('❌ Error:', promoError.message);
    } else {
      console.log(`✅ Found ${promotions.length} promotions`);
      promotions.forEach(p => console.log(`   - ${p.code}: ${p.name} (${p.promo_type})`));
    }
    
    console.log('\n2. Checking promotion_scope_targets table...');
    const { data: scopes, error: scopeError } = await supabase
      .from('promotion_scope_targets')
      .select('*')
      .limit(5);
    
    if (scopeError) {
      if (scopeError.code === '42P01') {
        console.log('⚠️  Table does not exist - migration needed');
      } else {
        console.error('❌ Error:', scopeError.message);
      }
    } else {
      console.log(`✅ Found ${scopes.length} scope targets`);
      scopes.forEach(s => console.log(`   - ${s.promotion_code}: ${s.target_type}/${s.target_id} (included: ${s.is_included})`));
    }
    
    console.log('\n3. Checking promotion_rules table...');
    const { data: rules, error: rulesError } = await supabase
      .from('promotion_rules')
      .select('*')
      .limit(5);
    
    if (rulesError) {
      if (rulesError.code === '42P01') {
        console.log('⚠️  Table does not exist - migration needed');
      } else {
        console.error('❌ Error:', rulesError.message);
      }
    } else {
      console.log(`✅ Found ${rules.length} rules`);
      rules.forEach(r => console.log(`   - ${r.promotion_code}: order ${r.rule_order}`));
    }
    
    console.log('\n4. Checking legacy tables...');
    
    // Check promotion_scopes
    const { data: legacyScopes, error: legacyScopeError } = await supabase
      .from('promotion_scopes')
      .select('*')
      .limit(3);
    
    if (!legacyScopeError) {
      console.log(`✅ promotion_scopes: ${legacyScopes.length} rows (will be backfilled)`);
    } else {
      console.log('⚠️  promotion_scopes: table not found');
    }
    
    // Check promotion_targets
    const { data: legacyTargets, error: legacyTargetError } = await supabase
      .from('promotion_targets')
      .select('*')
      .limit(3);
    
    if (!legacyTargetError) {
      console.log(`✅ promotion_targets: ${legacyTargets.length} rows (will be backfilled)`);
    } else {
      console.log('⚠️  promotion_targets: table not found');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('DATABASE STATE CHECK COMPLETE');
    console.log('='.repeat(60));
    
    // Check if migration is needed
    if (scopeError?.code === '42P01' || rulesError?.code === '42P01') {
      console.log('\n⚠️  MIGRATION NEEDED');
      console.log('\nTo run the migration:');
      console.log('1. Go to: https://supabase.com/dashboard/project/xolpfbadtfwsurzsjxts/sql/new');
      console.log('2. Copy contents of: supabase/migrations/20260131_promotion_scope_targets.sql');
      console.log('3. Paste and click Run\n');
    } else {
      console.log('\n✅ All tables exist - migration already completed!');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

checkDatabase();
