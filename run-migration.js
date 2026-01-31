// Quick migration runner using pg
const fs = require('fs');
const { Client } = require('pg');

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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE credentials in .env.local');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

console.log('Project Ref:', projectRef);
console.log('Service Key:', supabaseServiceKey.substring(0, 20) + '...');

// Try using Supabase REST API to execute SQL
const fetch = require('node:fetch');

async function executeSqlViaRest(sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  
  return await response.json();
}

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('./supabase/migrations/20260131_promotion_scope_targets.sql', 'utf8');
    
    console.log('Executing migration via Supabase REST API...');
    const result = await executeSqlViaRest(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log(result);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    
    // Fallback: Output instructions for manual execution
    console.log('\n📋 Please run the migration manually:');
    console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('2. Copy the contents of: supabase/migrations/20260131_promotion_scope_targets.sql');
    console.log('3. Paste and click Run');
    process.exit(1);
  }
}

runMigration();
