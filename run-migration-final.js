// Execute migration using Supabase SQL query
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  console.log('📋 Reading migration file...\n');
  const sql = fs.readFileSync('./supabase/migrations/20260131_promotion_scope_targets.sql', 'utf8');
  
  // Split by statement (rough split on semicolons outside of DO blocks)
  const statements = [];
  let current = '';
  let inDoBlock = false;
  
  for (const line of sql.split('\n')) {
    current += line + '\n';
    
    if (line.includes('DO $$')) inDoBlock = true;
    if (line.includes('END $$;')) inDoBlock = false;
    
    if (line.trim().endsWith(';') && !inDoBlock && !line.includes('--')) {
      if (current.trim() && !current.trim().startsWith('--')) {
        statements.push(current.trim());
      }
      current = '';
    }
  }
  
  console.log(`Found ${statements.length} SQL statements\n`);
  console.log('⚠️  Supabase client cannot execute raw SQL directly.');
  console.log('The migration must be run through the Supabase Dashboard.\n');
  
  console.log('='.repeat(70));
  console.log('READY TO MIGRATE - 18 category scopes will be backfilled');
  console.log('='.repeat(70));
  console.log('\n📍 COPY THIS TO DASHBOARD:');
  console.log('   URL: https://supabase.com/dashboard/project/xolpfbadtfwsurzsjxts/sql/new');
  console.log('   File: supabase/migrations/20260131_promotion_scope_targets.sql');
  console.log('\n✅ After running, the following will happen:');
  console.log('   1. Creates promotion_scope_targets table');
  console.log('   2. Backfills 18 CATEGORY scopes from promotion_scopes');
  console.log('   3. Updates promotion_rules structure (if needed)');
  console.log('   4. Adds indexes for performance');
  console.log('\n💡 The browser tab with SQL Editor should still be open!');
}

runMigration();
