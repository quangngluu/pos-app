/**
 * Test the nearest_store function directly
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log('🧪 Testing nearest_store function...\n');
  
  // Test with HCM coordinates (Turtle Lake area)
  const testCoords = [
    { name: 'Turtle Lake (District 3)', lat: 10.7831855, lng: 106.695983 },
    { name: 'Ben Thanh Market', lat: 10.7717059, lng: 106.6976163 },
    { name: 'District 1 Center', lat: 10.776, lng: 106.701 },
  ];
  
  for (const coords of testCoords) {
    console.log(`📍 ${coords.name} (${coords.lat}, ${coords.lng}):`);
    
    const { data, error } = await supabase.rpc('nearest_store', {
      p_lat: coords.lat,
      p_lng: coords.lng,
      limit_n: 3
    });
    
    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      console.error(`   Details:`, error);
    } else if (data && data.length > 0) {
      console.log(`   ✅ Found ${data.length} stores:`);
      data.forEach((store, i) => {
        console.log(`      ${i + 1}. ${store.name} - ${Math.round(store.distance_m)}m`);
      });
    } else {
      console.log(`   ⚠️  No stores found`);
    }
    console.log('');
  }
}

test();
