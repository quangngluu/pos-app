import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hoycebnqhfxhrogiydah.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhveWNlYm5xaGZ4aHJvZ2l5ZGFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjkxNTU5MCwiZXhwIjoyMDUyNDkxNTkwfQ.UeFBJQPM0CwhDLGudi0QuCbGFp6MHr-J7YI5I5xTOxM"
);

async function check() {
  // Check categories table
  const { data: cats, error: catErr } = await supabase.from("categories").select("*").limit(10);
  console.log("=== categories ===");
  if (catErr) console.log("Error:", catErr.message);
  else console.log(JSON.stringify(cats, null, 2));

  // Check product_categories
  const { data: prodCats, error: pcErr } = await supabase.from("product_categories").select("*").limit(10);
  console.log("\n=== product_categories ===");
  if (pcErr) console.log("Error:", pcErr.message);
  else console.log(JSON.stringify(prodCats, null, 2));

  // Check subcategories
  const { data: subcats, error: subErr } = await supabase.from("subcategories").select("*").limit(10);
  console.log("\n=== subcategories ===");
  if (subErr) console.log("Error:", subErr.message);
  else console.log(JSON.stringify(subcats, null, 2));

  // Check stores
  const { data: stores, error: storeErr } = await supabase.from("stores").select("id, name, is_active").limit(5);
  console.log("\n=== stores ===");
  if (storeErr) console.log("Error:", storeErr.message);
  else console.log(JSON.stringify(stores, null, 2));

  // Check promotions
  const { data: promos, error: promoErr } = await supabase.from("promotions").select("code, name, is_active").limit(5);
  console.log("\n=== promotions ===");
  if (promoErr) console.log("Error:", promoErr.message);
  else console.log(JSON.stringify(promos, null, 2));
}

check();
