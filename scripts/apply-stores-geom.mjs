/**
 * Apply stores geom migration
 * Run with: node --loader tsx scripts/apply-stores-geom.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables. Make sure .env.local is loaded.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function applyMigration() {
  try {
    console.log('🔧 Applying stores geom migration...\n');
    
    // Step 1: Enable PostGIS
    console.log('1. Enabling PostGIS extension...');
    let { error: ext1 } = await supabase.rpc('exec', { 
      sql: 'CREATE EXTENSION IF NOT EXISTS postgis;' 
    });
    
    // Step 2: Add geom column
    console.log('2. Adding geom column...');
    const { error: col1 } = await supabase.rpc('exec', {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'stores' 
            AND column_name = 'geom'
          ) THEN
            ALTER TABLE public.stores ADD COLUMN geom geometry(Point, 4326) NULL;
            CREATE INDEX idx_stores_geom_gist ON public.stores USING gist(geom);
          END IF;
        END $$;
      `
    });
    
    // Step 3: Add lat/lng columns
    console.log('3. Adding lat/lng columns...');
    const { error: col2 } = await supabase.rpc('exec', {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'lat') THEN
            ALTER TABLE public.stores ADD COLUMN lat double precision NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'lng') THEN
            ALTER TABLE public.stores ADD COLUMN lng double precision NULL;
          END IF;
        END $$;
      `
    });
    
    // Step 4: Create trigger
    console.log('4. Creating auto-update trigger...');
    const { error: trig } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION update_stores_geom()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
          ELSE
            NEW.geom := NULL;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_update_stores_geom ON public.stores;
        CREATE TRIGGER trigger_update_stores_geom
          BEFORE INSERT OR UPDATE OF lat, lng
          ON public.stores
          FOR EACH ROW
          EXECUTE FUNCTION update_stores_geom();
      `
    });
    
    // Step 5: Recreate nearest_store function with qualified column names
    console.log('5. Updating nearest_store function...');
    const { error: func } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION nearest_store(
          lat double precision,
          lng double precision,
          limit_n integer DEFAULT 5
        )
        RETURNS TABLE (
          id uuid,
          name text,
          address_full text,
          distance_m double precision
        )
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
          safe_limit integer;
        BEGIN
          safe_limit := GREATEST(1, LEAST(limit_n, 20));
          
          RETURN QUERY
          SELECT
            s.id,
            s.name,
            s.address_full,
            ST_Distance(
              s.geom::geography,
              ST_SetSRID(ST_MakePoint(nearest_store.lng, nearest_store.lat), 4326)::geography
            ) AS distance_m
          FROM public.stores s
          WHERE s.is_active = true
            AND s.geom IS NOT NULL
          ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(nearest_store.lng, nearest_store.lat), 4326)
          LIMIT safe_limit;
        END;
        $$;
      `
    });
    
    console.log('\n✅ Migration completed!\n');
    
    // Test query
    console.log('📍 Testing nearest_store function...');
    const { data, error } = await supabase.rpc('nearest_store', {
      lat: 10.776,
      lng: 106.701,
      limit_n: 5
    });
    
    if (error) {
      console.error('❌ Test failed:', error.message);
      console.log('\nPlease ensure:');
      console.log('1. PostGIS extension is enabled');
      console.log('2. Stores have lat/lng values populated');
      console.log('3. The nearest_store function exists');
    } else {
      console.log(`✅ Found ${data?.length || 0} stores`);
      if (data && data.length > 0) {
        console.log('\nNearest stores:');
        data.forEach((store, i) => {
          console.log(`  ${i + 1}. ${store.name} - ${Math.round(store.distance_m)}m`);
        });
      } else {
        console.log('\n⚠️  No stores found. You may need to populate store coordinates.');
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

applyMigration();
