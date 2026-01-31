/**
 * Quick migration runner for stores geom setup
 * Run with: node scripts/run-geom-migration.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import supabaseAdmin
const { supabaseAdmin } = await import('../src/app/lib/supabaseAdmin.ts');

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationPath = join(__dirname, '../supabase/migrations/20260131_stores_geom_setup.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log('Executing migration...');
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully!');
    
    // Test the nearest_store function
    console.log('\nTesting nearest_store function with HCM coordinates (10.776, 106.701)...');
    const { data: stores, error: testError } = await supabaseAdmin.rpc('nearest_store', {
      lat: 10.776,
      lng: 106.701,
      limit_n: 5
    });
    
    if (testError) {
      console.error('Test failed:', testError);
    } else {
      console.log(`Found ${stores?.length || 0} stores:`);
      console.log(JSON.stringify(stores, null, 2));
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

runMigration();
