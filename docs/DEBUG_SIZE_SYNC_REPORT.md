# DEBUG SIZE SYNC REPORT

**Date:** 2026-01-31  
**Issue:** "Mất size / không pick được size / size không đồng bộ" trong màn chọn món và order items

---

## 1. DB "Source of Truth" cho sản phẩm/size/sku/giá

### 1.1 Bảng & Mục đích

| Bảng | Mục đích | Status |
|------|----------|--------|
| `products` | Base product info | **PRIMARY** |
| `product_variants` | SKU/Size variants (SIZE_PHE, SIZE_LA, STD) | **PRIMARY (New)** |
| `product_variant_prices` | Prices per variant | **PRIMARY (New)** |
| `product_prices` | Legacy pricing (PRICE_PHE, PRICE_LARGE, PRICE_SMALL) | **DEPRECATED - Fallback** |
| `product_skus` | Legacy SKU mapping | **DEPRECATED** |
| `categories` | Category master | **PRIMARY** |
| `subcategories` | Subcategory/menu section | **PRIMARY** |
| `promotion_scopes` | Promotion category targeting | **LEGACY** |
| `promotion_targets` | Promotion product targeting | **LEGACY** |
| `promotion_target_variants` | Promotion variant targeting | **NEW** |

### 1.2 Cột quan trọng & Constraints

#### `products` table
```sql
-- File: supabase/migrations/202601310200_product_variants_schema.sql
id              UUID PRIMARY KEY
code            TEXT NOT NULL UNIQUE
name            TEXT NOT NULL
category_code   TEXT REFERENCES categories(code)  -- PRIMARY (new)
category        TEXT                              -- LEGACY fallback
menu_section    TEXT
is_active       BOOLEAN DEFAULT true
subcategory_id  UUID REFERENCES subcategories(id) -- Optional
```

#### `product_variants` table
```sql
-- File: supabase/migrations/202601310200_product_variants_schema.sql (line 57-70)
id          UUID PRIMARY KEY
product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE
size_key    size_key NOT NULL  -- ENUM: 'STD' | 'SIZE_PHE' | 'SIZE_LA'
sku_code    TEXT NOT NULL UNIQUE
is_active   BOOLEAN DEFAULT true
sort_order  INTEGER DEFAULT 0

CONSTRAINT uq_product_size UNIQUE(product_id, size_key)
```

#### `product_variant_prices` table
```sql
-- File: supabase/migrations/202601310200_product_variants_schema.sql (line 77-82)
variant_id      UUID PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE
price_vat_incl  NUMERIC NOT NULL CHECK (price_vat_incl >= 0)
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

#### Legacy `product_prices` table (DEPRECATED)
```sql
product_id      UUID REFERENCES products(id)
price_key       TEXT  -- 'PRICE_SMALL' | 'PRICE_PHE' | 'PRICE_LARGE'
price_vat_incl  NUMERIC
```

#### Legacy `product_skus` table (DEPRECATED)
```sql
product_id  UUID REFERENCES products(id)
price_key   TEXT  -- 'PRICE_SMALL' | 'PRICE_PHE' | 'PRICE_LARGE'
sku_code    TEXT
```

### 1.3 KẾT LUẬN: Nguồn giá chuẩn

**Source of Truth: VARIANT-FIRST**

1. **Primary**: `product_variants` + `product_variant_prices`
2. **Fallback**: `product_prices` (chỉ khi product không có variant)

```
price_key mapping:
  SIZE_PHE  ←→ PRICE_PHE
  SIZE_LA   ←→ PRICE_LARGE
  STD       ←→ PRICE_SMALL
```

---

## 2. View/Menu API mà POS đang dùng

### 2.1 View Definition

**File:** [supabase/migrations/202601310300_products_menu_view_update.sql](../supabase/migrations/202601310300_products_menu_view_update.sql)

```sql
CREATE OR REPLACE VIEW public.v_products_menu AS
WITH variant_prices AS (
  -- Get prices from variant pricing (source of truth)
  SELECT 
    pv.product_id,
    pv.size_key,
    pvp.price_vat_incl
  FROM public.product_variants pv
  INNER JOIN public.product_variant_prices pvp ON pvp.variant_id = pv.id
  WHERE pv.is_active = true
),
legacy_prices AS (
  -- Fallback to legacy product_prices for products without variants
  SELECT 
    pp.product_id,
    CASE 
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key
      ELSE 'STD'::public.size_key
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv 
    WHERE pv.product_id = pp.product_id
  )
),
all_prices AS (
  SELECT * FROM variant_prices
  UNION ALL
  SELECT * FROM legacy_prices
)
SELECT 
  p.id AS product_id,
  p.code AS product_code,
  p.name,
  COALESCE(p.category_code, p.category) AS category,
  p.menu_section,
  p.is_active,
  p.subcategory_id,
  -- Pivot prices
  MAX(CASE WHEN ap.size_key = 'SIZE_PHE' THEN ap.price_vat_incl END) AS price_phe,
  MAX(CASE WHEN ap.size_key = 'SIZE_LA' THEN ap.price_vat_incl END) AS price_la,
  MAX(CASE WHEN ap.size_key = 'STD' THEN ap.price_vat_incl END) AS price_std,
  c.name AS category_name,
  sc.name AS subcategory_name,
  sc.id AS subcategory_id_resolved
FROM public.products p
LEFT JOIN all_prices ap ON ap.product_id = p.id
LEFT JOIN public.categories c ON c.code = COALESCE(p.category_code, p.category)
LEFT JOIN public.subcategories sc ON sc.id = p.subcategory_id
WHERE p.is_active = true
GROUP BY p.id, p.code, p.name, p.category_code, p.category, p.menu_section, 
         p.is_active, p.subcategory_id, c.name, sc.name, sc.id;
```

### 2.2 Cột POS đang cần

| Column | Type | Mapping |
|--------|------|---------|
| `product_id` | UUID | products.id |
| `product_code` | TEXT | products.code |
| `name` | TEXT | products.name |
| `category` | TEXT | category_code ?? category (legacy) |
| `price_std` | NUMERIC \| NULL | STD variant price |
| `price_phe` | NUMERIC \| NULL | SIZE_PHE variant price |
| `price_la` | NUMERIC \| NULL | SIZE_LA variant price |

### 2.3 Size Key Mapping

| DB size_key | UI Label | price_key (legacy) |
|-------------|----------|-------------------|
| `STD` | "STD" | `PRICE_SMALL` |
| `SIZE_PHE` | "Phê" | `PRICE_PHE` |
| `SIZE_LA` | "La" | `PRICE_LARGE` |

---

## 3. Luồng UI chọn món và size

### 3.1 File UI

**Primary:** [src/app/pos/page.tsx](../src/app/pos/page.tsx)

### 3.2 Data Flow Trace

```
1. Load menu data (useEffect, line ~340-360)
   └─> supabase.from("v_products_menu").select("*")
   └─> setProducts(data as ProductRow[])

2. User clicks product card (onClick, line ~1930-1980)
   └─> addProductToDraft(product)
   
3. addProductToDraft() (line ~756-780)
   └─> const avail = getAvailableSizes(product)
   └─> const defaultSize = avail[0] ?? "STD"
   └─> setDraftLines([...prev, newDraft])

4. Size picker renders (line ~2227-2242)
   └─> getAvailableSizes(product)
   └─> ChipGroup with options filtered to availSizes
   └─> onChange: updateDraftLine(draft.id, { size: value })

5. Add to order (line ~793-840)
   └─> setLines(prev => [...prev, ...itemsToAdd])
   
6. Quote API call (useEffect, line ~420-480)
   └─> POST /api/quote with line.size as price_key
   └─> Response includes display_price_key, charged_price_key

7. Order creation (line ~938-1040)
   └─> display_size = ql?.display_price_key ?? l.size
   └─> price_key = ql?.charged_price_key ?? l.size
```

### 3.3 State Key cho Size

**File:** [src/app/pos/page.tsx#L36-L44](../src/app/pos/page.tsx#L36-L44)

```typescript
type DraftLine = {
  id: string;
  product_id: string;
  qty: number;
  size: SizeKey;  // ← SIZE_PHE | SIZE_LA | STD
  sugar_value_code: string;
  note: string;
};
```

### 3.4 getAvailableSizes() - CRITICAL FUNCTION

**File:** [src/app/pos/page.tsx#L658-L675](../src/app/pos/page.tsx#L658-L675)

```typescript
/**
 * ROOT CAUSE ANALYSIS (TASK A):
 * The "lost size" bug occurs when:
 * 1. v_products_menu view returns NULL for price_phe/price_la because 
 *    product_variants or product_variant_prices are missing
 * 2. When price fields are NULL, getAvailableSizes returns only ["STD"]
 * 3. The view relies on JOIN with product_variants + product_variant_prices - 
 *    if either is empty, prices become NULL
 */
function getAvailableSizes(p: ProductRow | null): SizeKey[] {
  if (!p) return ["STD"];
  const sizes: SizeKey[] = [];
  if (p.price_phe != null) sizes.push("SIZE_PHE");
  if (p.price_la != null) sizes.push("SIZE_LA");
  if (p.price_std != null) sizes.push("STD");
  return sizes.length ? sizes : ["STD"];
}
```

### 3.5 UI điều kiện hiển thị Size Chips

**Line ~2227-2242:**
```typescript
{availSizes.length >= 1 && (
  <ChipGroup
    value={draft.size}
    options={[
      { value: "SIZE_PHE", label: "Phê", disabled: !availSizes.includes("SIZE_PHE") },
      { value: "SIZE_LA", label: "La", disabled: !availSizes.includes("SIZE_LA") },
      { value: "STD", label: "STD", disabled: !availSizes.includes("STD") },
    ].filter(opt => availSizes.includes(opt.value as SizeKey))}
    onChange={(size) => updateDraftLine(draft.id, { size: size as SizeKey })}
  />
)}
```

**Condition:** Size picker shows if `availSizes.length >= 1`  
**Filtering:** Only shows sizes where price != NULL

---

## 4. Pricing Engine + API quote/price

### 4.1 pricingEngine.ts

**File:** [src/app/lib/pricingEngine.ts](../src/app/lib/pricingEngine.ts)

#### Engine Input Types (line 14-23)
```typescript
export type QuoteLine = {
  line_id: string;
  product_id: string;
  qty: number;
  price_key: string; // SIZE_PHE | SIZE_LA | STD
  options?: Record<string, string>;
};
```

#### Price Lookup (line 268-292)
```typescript
// Build price map: prefer variant pricing, fallback to legacy product_prices
const priceMap = new Map<string, number>();

// First, load variant pricing (source of truth)
(variantsResult.data ?? []).forEach(v => {
  const priceKey = v.size_key; // STD, SIZE_PHE, SIZE_LA
  const priceRecord = Array.isArray(v.product_variant_prices) 
    ? v.product_variant_prices[0] 
    : v.product_variant_prices;
  
  if (priceRecord?.price_vat_incl != null) {
    priceMap.set(key(v.product_id, priceKey), money(priceRecord.price_vat_incl));
  }
});

// Fallback: load legacy pricing for products without variant pricing
const productsWithVariantPricing = new Set(
  (variantsResult.data ?? []).map(v => v.product_id)
);

(legacyPricesResult.data ?? []).forEach(p => {
  if (!productsWithVariantPricing.has(p.product_id)) {
    priceMap.set(key(p.product_id, p.price_key), money(p.price_vat_incl));
  }
});
```

#### FREE_UPSIZE Logic (line 510-535)
```typescript
// FREE_UPSIZE: display LA, charge PHE (only if eligible)
const hasBothSizes =
  priceMap.has(key(l.product_id, "SIZE_PHE")) &&
  priceMap.has(key(l.product_id, "SIZE_LA"));

if (
  freeUpsize &&
  isDrink &&
  eligibleForPromo &&
  l.price_key === "SIZE_PHE" &&
  hasBothSizes
) {
  displayKey = "SIZE_LA";
  chargedKey = "SIZE_PHE";
}
```

### 4.2 Quote API

**File:** [src/app/api/quote/route.ts](../src/app/api/quote/route.ts)

```typescript
const LineSchema = z.object({
  line_id: z.string().uuid(),
  product_id: z.string().uuid(),
  qty: z.number().int().positive(),
  price_key: z.string(), // SIZE_PHE | SIZE_LA | STD
  options: z.record(z.string(), z.string()).optional().default({}),
});
```

### 4.3 DISCOUNT Scope Validation

**Line 428-442:**
```typescript
// BUSINESS RULE: If NO included scopes (any type), apply NONE
const hasIncludeScope = 
  includedCategories.length > 0 || 
  includedSubcategories.length > 0 || 
  includeProductIds.length > 0 || 
  includeVariantIds.length > 0;

const legacyDiscountRate =
  promo?.promo_type === "DISCOUNT" && hasIncludeScope
    ? Number(promo.percent_off ?? 0) / 100
    : 0;
```

---

## 5. Đồng bộ SKU

### 5.1 SKU Source

**Primary:** `product_variants.sku_code`

```typescript
// pricingEngine.ts line 452-455
const variantMap = new Map<string, string>(); // key: product_id|size_key -> variant_id
(variantsResult.data ?? []).forEach(v => {
  variantMap.set(key(v.product_id, v.size_key), v.id);
});
```

### 5.2 Order Line Snapshot

**File:** [src/app/api/orders/route.ts#L263-280](../src/app/api/orders/route.ts#L263-280)

```typescript
const linesToInsert = body.lines.map((l) => {
  const ql = quoteLineMap.get(l.line_id);
  const options_snapshot: any = {};
  if (l.sugar_value_code) options_snapshot.sugar_value_code = l.sugar_value_code;

  return {
    order_id: orderId,
    product_id: l.product_id,
    product_name_snapshot: l.product_name_snapshot || "",
    price_key_snapshot: l.display_size, // Store display size (LA for free upsize)
    unit_price_snapshot: ql?.unit_price_after ?? 0,
    qty: l.qty,
    options_snapshot: JSON.stringify(options_snapshot),
    line_total_snapshot: (ql?.unit_price_after ?? 0) * l.qty,
    line_discount_snapshot: (ql?.line_total_before ?? 0) - (ql?.line_total_after ?? 0),
  };
});
```

---

## 6. KẾT LUẬN: Điểm lệch (Mismatch) gây bug size

### Hypothesis 1: Missing Variant Data (CONFIRMED - HIGH PROBABILITY)

**Evidence:**
- [src/app/pos/page.tsx#L658-675](../src/app/pos/page.tsx#L658-L675): `getAvailableSizes()` returns `["STD"]` when `price_phe` and `price_la` are NULL
- [202601310300_products_menu_view_update.sql#L95-145](../supabase/migrations/202601310300_products_menu_view_update.sql#L95-L145): View uses `INNER JOIN` for variants → prices
- **If product_variants or product_variant_prices is EMPTY for a product, view returns NULL for price fields**

**Root Cause Flow:**
```
DRINK product without variants
  → v_products_menu returns price_phe=NULL, price_la=NULL
  → getAvailableSizes(p) returns ["STD"] or empty
  → UI hides size chips OR defaults to STD
  → User cannot select Phê/La
```

### Hypothesis 2: Size Key Format Mismatch (LOW PROBABILITY)

**Evidence:**
- UI uses: `SIZE_PHE`, `SIZE_LA`, `STD`
- DB enum: `'STD' | 'SIZE_PHE' | 'SIZE_LA'`
- pricingEngine uses: same format
- ✅ **No mismatch found** - all use same enum values

### Hypothesis 3: Legacy Fallback Not Working (MEDIUM PROBABILITY)

**Evidence:**
- [202601310300_products_menu_view_update.sql#L109-123](../supabase/migrations/202601310300_products_menu_view_update.sql#L109-L123): `legacy_prices` CTE only activates `WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = pp.product_id)`
- **If product has ANY variant (even just STD), legacy fallback is DISABLED**
- Result: Product with partial variants (only STD) won't get PHE/LA prices from legacy

### Hypothesis 4: Quote Response Ignored (LOW PROBABILITY)

**Evidence:**
- [src/app/pos/page.tsx#L1320-1325](../src/app/pos/page.tsx#L1320-L1325): UI correctly reads `ql?.display_price_key`
- [src/app/api/orders/route.ts#L272](../src/app/api/orders/route.ts#L272): Order correctly stores `l.display_size`
- ✅ **No issue found**

---

## 7. PRIORITIZED FIX RECOMMENDATIONS

### P0: Fix Missing Variant Data (CRITICAL)

**Problem:** Products exist but have no variants/prices in new tables.

**Fix:** Run data backfill migration
- File: [supabase/migrations/20260131_fix_missing_variants.sql](../supabase/migrations/20260131_fix_missing_variants.sql)

```sql
-- Creates SIZE_PHE + SIZE_LA variants for DRINK products
-- Creates STD variants for non-DRINK products
-- Creates prices from legacy product_prices with fallback defaults
```

### P1: Update View Fallback Logic (MEDIUM)

**Problem:** View uses INNER JOIN, products with partial variants lose legacy prices.

**Fix:** Modify view to use LEFT JOIN with COALESCE

```sql
-- Option: Allow legacy prices to fill gaps even when variants exist
SELECT 
  pv.product_id,
  pv.size_key,
  COALESCE(pvp.price_vat_incl, lp.price_vat_incl) as price_vat_incl
FROM product_variants pv
LEFT JOIN product_variant_prices pvp ON pvp.variant_id = pv.id
LEFT JOIN legacy_prices lp ON lp.product_id = pv.product_id 
  AND lp.size_key = pv.size_key
WHERE pv.is_active = true
```

### P2: Add Admin Validation (LOW)

**Problem:** Admin can create products without variants.

**Fix:** Add validation in admin product creation to ensure DRINK products have SIZE_PHE + SIZE_LA variants.

---

## 8. Test Checklist

| # | Test Case | Expected | Verify |
|---|-----------|----------|--------|
| 1 | DRINK với cả Phê+La variant | Size picker hiện 2 options | [ ] |
| 2 | DRINK chỉ có STD variant | Size picker ẩn hoặc chỉ STD | [ ] |
| 3 | CAKE chỉ có STD | Size picker ẩn | [ ] |
| 4 | Quote FREE_UPSIZE 5 drinks | display=LA, charged=PHE | [ ] |
| 5 | Order create với size LA | price_key_snapshot=SIZE_LA | [ ] |

---

## Appendix: Quick Diagnostic Queries

```sql
-- Products missing ALL variants
SELECT COUNT(*) FROM products p
WHERE p.is_active = true
AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id);

-- DRINK products missing SIZE_PHE or SIZE_LA
SELECT p.code, p.name 
FROM products p
WHERE COALESCE(p.category_code, p.category) = 'DRINK'
AND p.is_active = true
AND (
  NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_PHE')
  OR NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.size_key = 'SIZE_LA')
);

-- Variants without prices
SELECT pv.product_id, pv.size_key, pv.sku_code
FROM product_variants pv
WHERE pv.is_active = true
AND NOT EXISTS (SELECT 1 FROM product_variant_prices pvp WHERE pvp.variant_id = pv.id);

-- Compare view vs variants for sample products
SELECT 
  v.product_id, v.name, v.price_phe, v.price_la, v.price_std,
  (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = v.product_id) as variant_count
FROM v_products_menu v
WHERE v.category = 'DRINK'
LIMIT 10;
```
