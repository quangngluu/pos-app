const fs = require("fs");
fs.readFileSync(".env.local", "utf8").split("\n").forEach(line => {
  const [k, ...v] = line.split("=");
  if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
});
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Prices from phela.vn website (March 2026)
const WEBSITE_PRICES = {
  // CÀ PHÊ (single size = SIZE_LA)
  "DRK_PXV": { SIZE_LA: 50000 },    // Phê Xỉu Vani
  "DRK_PECE": { SIZE_LA: 50000 },    // Phê Espresso (Colom, Ethi)
  "DRK_PER": { SIZE_LA: 45000 },    // Phê Espresso (RO, Ara)
  "DRK_PLCE": { SIZE_LA: 59000 },    // Phê Latte (Colom, Ethi)
  "DRK_PLR": { SIZE_LA: 54000 },    // Phê Latte (RO, Ara)
  "DRK_PCRA": { SIZE_LA: 54000 },    // Phê Cappu (RO, Ara)
  "DRK_PCCE": { SIZE_LA: 59000 },    // Phê Cappu (Colom, Ethi)
  "DRK_PAR": { SIZE_LA: 45000 },    // Phê Ame (RO, Ara)
  "DRK_PACE": { SIZE_LA: 50000 },    // Phê Ame (Colom, Ethi)
  "DRK_PN": { SIZE_LA: 39000 },    // Phê Nâu
  "DRK_PD": { SIZE_LA: 39000 },    // Phê Đen
  "DRK_DL": { SIZE_LA: 45000 },    // Đà Lạt

  // SYPHON (Phê + La)
  "DRK_PL": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Phong Lan
  "DRK_OLS": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Ô Long Sữa Phê La → renamed
  "DRK_OLNS": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Ô Long Nhài Sữa
  "DRK_MN": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Mật Nhãn

  // FRENCH PRESS
  "DRK_LD": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Lụa Đào
  "DRK_TVCP": { SIZE_PHE: 54000, SIZE_LA: 69000 },  // Trà Vỏ Cà Phê
  "DRK_OLDH": { SIZE_LA: 69000 },                    // Ô Long Đào Hồng (La only)
  "DRK_G": { SIZE_PHE: 54000, SIZE_LA: 69000 },   // Gấm

  // MOKA POT
  "DRK_T": { SIZE_PHE: 54000, SIZE_LA: 69000 },   // Tấm
  "DRK_KB": { SIZE_PHE: 54000, SIZE_LA: 69000 },   // Khói B'Lao

  // COLD BREW
  "DRK_BB": { SIZE_LA: 64000 },                    // Bòng Bưởi
  "DRK_LB": { SIZE_PHE: 54000, SIZE_LA: 69000 },   // Lang Biang
  "DRK_SM": { SIZE_LA: 64000 },                    // Si Mơ

  // Ô LONG MATCHA
  "DRK_MPXPDX": { SIZE_LA: 64000 },                  // Matcha PXP (Phan Xi Păng)
  "DRK_MCL": { SIZE_LA: 59000 },                    // Matcha Coco Latte

  // TOPPING
  "TOP_TCGR": { STD: 10000 },  // Trân Châu Gạo Rang
  "TOP_TCOL": { STD: 10000 },  // Trân Châu Ô Long
  "TOP_TCPL": { STD: 10000 },  // Trân Châu Phong Lan
  "TOP_TTDH": { STD: 15000 },  // Thạch Trà Đào Hồng
  "TOP_TOLM": { STD: 15000 },  // Thạch Ô Long Matcha
  "TOP_TTV": { STD: 15000 },  // Thạch Trà Vỏ

  // PLUS
  "DRK_PK": { STD: 108000 },   // Plus - Khói
  "DRK_PMCL": { STD: 108000 },   // Plus - Matcha Coco Latte
  "DRK_PLD": { STD: 108000 },   // Plus - Lụa Đào
  "DRK_PPL": { STD: 108000 },   // Plus - Phong Lan
  "DRK_PCB": { STD: 98182 },    // Plus - Cold Brew
  "DRK_PDL": { STD: 137455 },   // Plus - Đà Lạt
  "DRK_PDPV": { STD: 137455 },   // Plus - Đỉnh Phù Vân
  "DRK_PT": { STD: 108000 },   // Plus - Tấm
  "DRK_POLNS": { STD: 108000 },   // Plus - Ô Long Nhài Sữa
  "DRK_POLSPL": { STD: 108000 },   // Plus - Ô Long Sữa Phê La

  // MANG VỀ NHÀ
  "ACC_BBOLSPL": { STD: 25000 },  // Bọt biển - Ô Long Sữa Phê La
  "ACC_BBPL": { STD: 25000 },  // Bọt biển - Phê Latte
  "ACC_BBPN": { STD: 25000 },  // Bọt biển - Phê Nâu
  "ACC_BBXV": { STD: 25000 },  // Bọt biển - Xe Van
  "ACC_BBTCGR": { STD: 25000 },  // Bọt biển - Trân Châu Gạo Rang
  "ACC_TTHCDD": { STD: 148000 }, // Túi Tote - Đai Trơn
  "ACC_TTHCDK": { STD: 148000 }, // Túi Tote - Đai Khuông Nhạc
  "ACC_PGPDS": { STD: 442000 }, // Phin Giấy - Phê Đặc Sản
  "ACC_PGPNB": { STD: 197000 }, // Phin Giấy - Phê Nguyên Bản
  "GIFT_HQTSTL6L": { STD: 177000 },// Hộp Quà Trà Sữa
  "GIFT_HQDN": { STD: 737000 }, // Hộp Quà Đĩa Nhạc
  "GIFT_HQPG": { STD: 590000 }, // Hộp Quà Phin Giấy
  "MER_PPNB200": { STD: 108000 }, // Phê Phin Nguyên Bản - 200gr
  "MER_PG150": { STD: 418000 }, // Phê Geisha - 150gr
  "MER_PE150": { STD: 246000 }, // Phê Ethiopia - 150gr
  "MER_PK150": { STD: 270000 }, // Phê Kenya - 150gr
  "MER_PC150": { STD: 295000 }, // Phê Colombia - 150gr
  "MER_OLMXDS150": { STD: 344000 },// Ô Long Mùa Xuân - 150gr
  "ACC_PGOLNS": { STD: 374000 }, // Phin Giấy - OL Nhài Sữa
  "ACC_PGOLSPL": { STD: 374000 }, // Phin Giấy - OL Sữa Phê La
  "MER_KLD": { STD: 99000 },  // Khăn Lụa Đào
};

// Name corrections to match website
const NAME_FIXES = {
  "DRK_OLS": "Ô Long Sữa Phê La",   // was "Ô long sữa"
  "DRK_OLNS": "Ô Long Nhài Sữa",     // was "Ô long Nhài sữa" 
  "DRK_OLDH": "Ô Long Đào Hồng",     // was "Ô Long Đào Hồng" (ok)
  "DRK_BB": "Bòng Bưởi",            // ok
  "DRK_G": "Gấm",                  // ok
  "DRK_MPXPDX": "Matcha Phan Xi Păng", // was "Matcha PXP (đá xay)"
  "DRK_SCBB": "Sữa Chua Bòng Bưởi",  // ok
  "DRK_SM": "Si Mơ",                // ok
};

async function run() {
  console.log("=== Scope C: Price + Name Sync ===\n");

  // Fetch all products with variants
  const { data: products } = await supabase.from("products").select("id, code, name").eq("is_active", true);
  const productMap = {};
  products.forEach(p => productMap[p.code] = p);

  // Fetch all variant prices
  const productIds = products.map(p => p.id);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id, size_key, product_variant_prices(price_vat_incl)")
    .in("product_id", productIds)
    .eq("is_active", true);

  // Build current price map: { productCode: { sizeKey: { variantId, price } } }
  const currentPrices = {};
  variants?.forEach(v => {
    const product = products.find(p => p.id === v.product_id);
    if (!product) return;
    if (!currentPrices[product.code]) currentPrices[product.code] = {};
    const priceRec = Array.isArray(v.product_variant_prices) ? v.product_variant_prices[0] : v.product_variant_prices;
    currentPrices[product.code][v.size_key] = {
      variantId: v.id,
      price: priceRec?.price_vat_incl ? Number(priceRec.price_vat_incl) : null
    };
  });

  // Compare and update prices
  console.log("--- Price updates ---");
  let priceChanges = 0;
  for (const [code, targetPrices] of Object.entries(WEBSITE_PRICES)) {
    const product = productMap[code];
    if (!product) { continue; }

    for (const [sizeKey, targetPrice] of Object.entries(targetPrices)) {
      const current = currentPrices[code]?.[sizeKey];
      if (!current) {
        console.log(`  ⚠️  ${code} ${sizeKey}: no variant (need to create)`);
        continue;
      }
      if (current.price !== targetPrice) {
        const { error } = await supabase
          .from("product_variant_prices")
          .update({ price_vat_incl: targetPrice })
          .eq("variant_id", current.variantId);
        if (error) {
          console.log(`  ❌ ${code} ${sizeKey}: ${error.message}`);
        } else {
          console.log(`  ✅ ${code} ${sizeKey}: ${current.price} → ${targetPrice}`);
          priceChanges++;
        }
      }
    }
  }
  console.log(`\nPrice changes: ${priceChanges}`);

  // Update names
  console.log("\n--- Name updates ---");
  let nameChanges = 0;
  for (const [code, newName] of Object.entries(NAME_FIXES)) {
    const product = productMap[code];
    if (!product) continue;
    if (product.name === newName) continue;

    const { error } = await supabase.from("products").update({ name: newName }).eq("id", product.id);
    if (error) {
      console.log(`  ❌ ${code}: ${error.message}`);
    } else {
      console.log(`  ✅ ${code}: "${product.name}" → "${newName}"`);
      nameChanges++;
    }
  }
  console.log(`\nName changes: ${nameChanges}`);

  console.log("\nDone!");
}

run().catch(console.error);
