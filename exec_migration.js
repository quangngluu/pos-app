const fs = require("fs");
fs.readFileSync(".env.local", "utf8").split("\n").forEach(line => {
  const [k, ...v] = line.split("=");
  if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
});
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// New products from phela.vn not in DB
const NEW_PRODUCTS = [
  // SYPHON category
  { code: "DRK_MN", name: "Mật Nhãn", category: "DRINK", sizes: { SIZE_PHE: 54000, SIZE_LA: 69000 }, sugar: true },
  // PLUS category
  { code: "DRK_PDPV", name: "Plus - Đỉnh Phù Vân", category: "DRINK", sizes: { STD: 137455 }, sugar: true },
  { code: "DRK_PMN", name: "Plus - Mật Nhãn", category: "DRINK", sizes: { STD: 108000 }, sugar: true },
  // TOPPING
  { code: "TOP_TCCK", name: "Trân Châu Chè Kho", category: "TOPPING", sizes: { STD: 10000 }, sugar: false },
  // MERCHANDISE
  { code: "ACC_BBTCGR", name: "Bọt biển - Trân Châu Gạo Rang", category: "MERCHANDISE", sizes: { STD: 25000 }, sugar: false },
  { code: "MER_KLD", name: "Khăn Lụa Đào", category: "MERCHANDISE", sizes: { STD: 99000 }, sugar: false },
  { code: "GIFT_HQPG", name: "Hộp Quà Phin Giấy", category: "MERCHANDISE", sizes: { STD: 590000 }, sugar: false },
];

// Products to deactivate (in DB but not on website anymore)
const DEACTIVATE_CODES = [
  "MER_CSD",    // Cam sấy dẻo
  "MER_DTSD",   // Dâu tây sấy dẻo
  "MER_MA",     // Mứt Atiso  
  "MER_VBS",    // Vỏ bưởi sấy
  "MER_XS",     // Xoài sấy
  "MER_PPT200", // Phê Phin Truffle
];

// Products with legacy STD prices that now have SIZE_LA (need to clean up)
const LEGACY_CLEANUP_CODES = [
  "DRK_PXV", "DRK_PN", "DRK_PD", "DRK_DL",
  "DRK_PACE", "DRK_PAR", "DRK_PCCE", "DRK_PCRA",
  "DRK_PECE", "DRK_PER", "DRK_PLCE", "DRK_PLR",
  "DRK_MPXPDX", "DRK_SC"
];

async function run() {
  console.log("=== Scope B: Add/Remove Products + Cleanup ===\n");

  // 1. Add new products
  console.log("--- Adding new products ---");
  for (const p of NEW_PRODUCTS) {
    // Check if already exists
    const { data: existing } = await supabase.from("products").select("id").eq("code", p.code).single();
    if (existing) {
      console.log(`  ⏭️  ${p.code} already exists`);
      continue;
    }

    // Create product
    const { data: product, error: pErr } = await supabase
      .from("products")
      .insert({ code: p.code, name: p.name, category: p.category, category_code: p.category, is_active: true })
      .select().single();

    if (pErr) { console.log(`  ❌ ${p.code}: ${pErr.message}`); continue; }

    // Create variants + prices
    for (const [sizeKey, price] of Object.entries(p.sizes)) {
      const skuCode = `${p.code}_${sizeKey}`;
      const { data: variant, error: vErr } = await supabase
        .from("product_variants")
        .insert({ product_id: product.id, size_key: sizeKey, sku_code: skuCode, is_active: true, sort_order: 0 })
        .select().single();

      if (vErr) { console.log(`  ❌ ${p.code} variant ${sizeKey}: ${vErr.message}`); continue; }

      await supabase.from("product_variant_prices").insert({ variant_id: variant.id, price_vat_incl: price });
    }

    // Add sugar options if needed
    if (p.sugar) {
      const { data: sugarOpts } = await supabase.from("option_values").select("code").eq("group_code", "sugar");
      if (sugarOpts && sugarOpts.length > 0) {
        const rows = sugarOpts.map(opt => ({
          product_id: product.id, group_code: "sugar", value_code: opt.code,
          is_enabled: true, is_default: opt.code === "SUGAR_100", sort_order: 0
        }));
        await supabase.from("product_option_values").upsert(rows, { onConflict: "product_id,group_code,value_code" });
      }
    }

    console.log(`  ✅ ${p.code} "${p.name}" — ${Object.entries(p.sizes).map(([k, v]) => `${k}=${v}`).join(", ")}${p.sugar ? " +sugar" : ""}`);
  }

  // 2. Deactivate old products
  console.log("\n--- Deactivating old products ---");
  for (const code of DEACTIVATE_CODES) {
    const { error } = await supabase.from("products").update({ is_active: false }).eq("code", code);
    console.log(error ? `  ❌ ${code}: ${error.message}` : `  ✅ ${code} → inactive`);
  }

  // 3. Clean up legacy STD prices for products that now use SIZE_LA
  console.log("\n--- Cleaning legacy STD prices ---");
  const { data: legacyProducts } = await supabase
    .from("products").select("id, code").in("code", LEGACY_CLEANUP_CODES);

  if (legacyProducts) {
    for (const p of legacyProducts) {
      // Check if this product has both a SIZE_LA variant AND a legacy STD in product_prices
      const { data: variants } = await supabase
        .from("product_variants").select("size_key").eq("product_id", p.id);
      const hasLA = variants?.some(v => v.size_key === "SIZE_LA");

      if (hasLA) {
        // Delete legacy STD from product_prices (old table)
        const { error, count } = await supabase
          .from("product_prices").delete().eq("product_id", p.id).eq("price_key", "STD");

        // Also delete STD variant if exists (shouldn't, but cleanup)
        const stdVariant = variants?.find(v => v.size_key === "STD");
        if (stdVariant) {
          // Don't delete the STD variant if it's the only one — but these products now have SIZE_LA
          // Actually we should keep it clean: these products migrated from STD to SIZE_LA
        }

        if (!error) console.log(`  ✅ ${p.code}: cleaned legacy STD`);
        else console.log(`  ❌ ${p.code}: ${error.message}`);
      }
    }
  }

  // 4. Verify
  console.log("\n--- Verification ---");
  const { data: allActive } = await supabase
    .from("products").select("code, name, category").eq("is_active", true).order("code");
  console.log(`Total active products: ${allActive?.length}`);

  const cats = {};
  allActive?.forEach(p => { cats[p.category || "?"] = (cats[p.category || "?"] || 0) + 1; });
  Object.entries(cats).sort().forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));

  console.log("\nDone!");
}

run().catch(console.error);
