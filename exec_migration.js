const fs = require("fs");
// Load env manually (no dotenv dependency)
fs.readFileSync(".env.local", "utf8").split("\n").forEach(line => {
  const [k, ...v] = line.split("=");
  if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
});
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("=== Product Catalog Refactor Migration ===\n");

  // Step 1: Get product IDs for single-size DRINK products that need STD → SIZE_LA
  const singleSizeCodes = [
    'DRK_PXV', 'DRK_PN', 'DRK_PD', 'DRK_DL',
    'DRK_PACE', 'DRK_PAR', 'DRK_PCCE', 'DRK_PCRA',
    'DRK_PECE', 'DRK_PER', 'DRK_PLCE', 'DRK_PLR',
    'DRK_MPXPDX', 'DRK_SC'
  ];

  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, code, name")
    .in("code", singleSizeCodes);

  if (pErr) { console.error("Failed to fetch products:", pErr); return; }
  console.log(`Found ${products.length} single-size DRINK products to fix.\n`);

  // Step 2: For each product, check if it has STD variant (no SIZE_LA)
  let fixedCount = 0;
  for (const p of products) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, size_key")
      .eq("product_id", p.id);

    const stdVariant = variants?.find(v => v.size_key === "STD");
    const hasLA = variants?.some(v => v.size_key === "SIZE_LA");

    if (stdVariant && !hasLA) {
      const { error: uErr } = await supabase
        .from("product_variants")
        .update({ size_key: "SIZE_LA" })
        .eq("id", stdVariant.id);

      if (uErr) {
        console.error(`  ❌ ${p.code} (${p.name}): ${uErr.message}`);
      } else {
        console.log(`  ✅ ${p.code} (${p.name}): STD → SIZE_LA`);
        fixedCount++;
      }
    } else if (!stdVariant) {
      console.log(`  ⏭️  ${p.code} (${p.name}): no STD variant found`);
    } else if (hasLA) {
      console.log(`  ⏭️  ${p.code} (${p.name}): already has SIZE_LA`);
    }
  }
  console.log(`\nFixed ${fixedCount} size keys.\n`);

  // Step 3: Fix Matcha Coco Latte (SIZE_PHE → SIZE_LA)
  const { data: mclProduct } = await supabase
    .from("products")
    .select("id")
    .eq("code", "DRK_MCL")
    .single();

  if (mclProduct) {
    const { data: mclVariants } = await supabase
      .from("product_variants")
      .select("id, size_key")
      .eq("product_id", mclProduct.id);

    const pheVariant = mclVariants?.find(v => v.size_key === "SIZE_PHE");
    const hasLA = mclVariants?.some(v => v.size_key === "SIZE_LA");

    if (pheVariant && !hasLA) {
      const { error } = await supabase
        .from("product_variants")
        .update({ size_key: "SIZE_LA" })
        .eq("id", pheVariant.id);
      console.log(error ? `❌ DRK_MCL fix: ${error.message}` : "✅ DRK_MCL: SIZE_PHE → SIZE_LA");
    }
  }

  // Step 4: Fix sugar options
  console.log("\n=== Fixing sugar options ===\n");

  // Turn OFF sugar for espresso/cappu/ame/latte/shot
  const sugarOffCodes = [
    'DRK_PECE', 'DRK_PER', 'DRK_PACE', 'DRK_PAR',
    'DRK_PCCE', 'DRK_PCRA', 'DRK_PLCE', 'DRK_PLR', 'DRK_SC'
  ];
  const { error: offErr, count: offCount } = await supabase
    .from("products")
    .update({ has_sugar_options: false })
    .in("code", sugarOffCodes);
  console.log(offErr
    ? `❌ Sugar OFF: ${offErr.message}`
    : `✅ Sugar OFF for ${sugarOffCodes.length} products (espresso/cappu/ame/latte/shot)`);

  // Turn ON sugar for common drinks
  const sugarOnCodes = [
    'DRK_PXV', 'DRK_PN', 'DRK_PD', 'DRK_DL', 'DRK_BB',
    'DRK_OLS', 'DRK_OLNS', 'DRK_OLDH', 'DRK_G', 'DRK_KB',
    'DRK_LB', 'DRK_LD', 'DRK_MCL', 'DRK_MPXPDX', 'DRK_PL',
    'DRK_SM', 'DRK_SCBB', 'DRK_T', 'DRK_TVCP'
  ];
  const { error: onErr } = await supabase
    .from("products")
    .update({ has_sugar_options: true })
    .in("code", sugarOnCodes);
  console.log(onErr
    ? `❌ Sugar ON: ${onErr.message}`
    : `✅ Sugar ON for ${sugarOnCodes.length} common drinks`);

  // Step 5: Deactivate test data
  console.log("\n=== Cleanup ===\n");
  const { error: deactErr } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("code", "DRK_SUGAR_TEST_DRINK");
  console.log(deactErr
    ? `❌ Deactivate test drink: ${deactErr.message}`
    : "✅ Deactivated Sugar Test Drink");

  console.log("\n=== Migration complete! ===");
  console.log("NOTE: v_products_menu view recreation must be done via Supabase SQL Editor");
  console.log("      (copy the DROP VIEW + CREATE VIEW from the .sql migration file)");
}

run().catch(console.error);
