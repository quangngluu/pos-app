/**
 * Check and populate store coordinates
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkStores() {
  console.log('📋 Checking stores...\n');
  
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, address_full, lat, lng, geom, is_active')
    .order('name');
  
  if (error) {
    console.error('Error fetching stores:', error);
    return;
  }
  
  console.log(`Found ${stores?.length || 0} stores:\n`);
  
  stores?.forEach((store, i) => {
    const status = [];
    if (!store.is_active) status.push('❌ INACTIVE');
    if (store.lat && store.lng) status.push('✅ Has lat/lng');
    else status.push('⚠️  Missing lat/lng');
    if (store.geom) status.push('✅ Has geom');
    else status.push('⚠️  Missing geom');
    
    console.log(`${i + 1}. ${store.name}`);
    console.log(`   ${status.join(' | ')}`);
    if (store.lat && store.lng) {
      console.log(`   Coords: ${store.lat}, ${store.lng}`);
    }
    console.log(`   Address: ${store.address_full || 'N/A'}\n`);
  });
  
  // Try to find HCM stores and add sample coordinates if needed
  const hcmStores = stores?.filter(s => 
    s.address_full?.toLowerCase().includes('hồ chí minh') || 
    s.address_full?.toLowerCase().includes('ho chi minh')
  );
  
  if (hcmStores && hcmStores.length > 0) {
    console.log(`\n📍 Found ${hcmStores.length} HCM store(s)`);
    
    for (const store of hcmStores) {
      if (!store.lat || !store.lng) {
        console.log(`\n⚠️  Store "${store.name}" needs coordinates`);
        console.log('   You can add them via admin panel or API');
      }
    }
  }
}

checkStores();
