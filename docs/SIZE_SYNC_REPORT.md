# SIZE SYNC DIAGNOSIS + FIX REPORT

**Date:** 2026-01-31  
**Issue:** "sizes missing / cannot pick size" in menu picker and selected items  
**Status:** ✅ ROOT CAUSE IDENTIFIED + FIX READY TO APPLY

## 🚨 QUICK FIX INSTRUCTIONS

1. **Go to:** Supabase Dashboard → SQL Editor
2. **Open file:** [supabase/migrations/20260131_APPLY_THIS_FIX.sql](../supabase/migrations/20260131_APPLY_THIS_FIX.sql)
3. **Copy entire contents and paste into SQL Editor**
4. **Click "Run"**
5. **Verify output shows:** DRINK products with BOTH PHE+LA: 9+

---

## SECTION A: DB DIAGNOSTICS (ACTUAL RESULTS)

### A.1 Counts

| Metric | Value |
|--------|-------|
| Total active products | 87 |
| Products with >=1 variant | **0** |
| DRINK products total | 37 |
| DRINK products missing SIZE_PHE or SIZE_LA | **37** (100%) |
| Variants missing prices | 0 (no variants exist) |

### A.2 Sample Problematic Rows

**DRINK products in v_products_menu with NULL price_phe or price_la:**
```
DRK_TVCP: price_phe=null, price_la=null, variants=[]
DRK_PK: price_phe=null, price_la=null, variants=[]
DRK_MPXPDX: price_phe=null, price_la=null, variants=[]
DRK_PACE: price_phe=null, price_la=null, variants=[]
DRK_PDL: price_phe=null, price_la=null, variants=[]
DRK_PLD: price_phe=null, price_la=null, variants=[]
DRK_PAR: price_phe=null, price_la=null, variants=[]
DRK_OLS: price_phe=null, price_la=null, variants=[]
... (all 37 DRINK products)
```

**Legacy product_prices data (sample):**
```
DRK_OLS: PHE=54000, LA=69000, STD=N/A    <- Has both sizes in legacy!
DRK_OLNS: PHE=54000, LA=69000, STD=N/A
DRK_PL: PHE=54000, LA=69000, STD=N/A
DRK_KB: PHE=54000, LA=69000, STD=N/A
DRK_T: PHE=54000, LA=69000, STD=N/A
DRK_LD: PHE=54000, LA=69000, STD=N/A
DRK_PK: PHE=N/A, LA=N/A, STD=108000      <- STD-only (Plus items)
DRK_PPL: PHE=N/A, LA=N/A, STD=108000
...
```

### A.3 Current View Definition Problem

**File:** [supabase/migrations/202601310300_products_menu_view_update.sql](../supabase/migrations/202601310300_products_menu_view_update.sql)

**CRITICAL BUG in legacy_prices CTE (lines 117-128):**
```sql
legacy_prices AS (
  SELECT 
    pp.product_id,
    CASE 
      WHEN pp.price_key = 'PRICE_SMALL' THEN 'STD'::public.size_key     -- WRONG!
      WHEN pp.price_key = 'PRICE_PHE' THEN 'SIZE_PHE'::public.size_key  -- WRONG!
      WHEN pp.price_key = 'PRICE_LARGE' THEN 'SIZE_LA'::public.size_key -- WRONG!
      ELSE 'STD'::public.size_key  -- ALL legacy falls here!
    END AS size_key,
    pp.price_vat_incl
  FROM public.product_prices pp
  ...
)
```

**Actual price_key values in product_prices table:**
- `'SIZE_PHE'` (11 rows)
- `'SIZE_LA'` (12 rows)  
- `'STD'` (84 rows)

**Expected values (from CASE):**
- `'PRICE_SMALL'`
- `'PRICE_PHE'`
- `'PRICE_LARGE'`

**Result:** ALL legacy prices fall to `ELSE 'STD'`, causing `price_phe=null, price_la=null` for everything!

### A.4 Proof of Root Cause

Query for `DRK_OLS`:
- **Legacy table:** `SIZE_PHE=54000, SIZE_LA=69000`
- **View returns:** `price_phe=null, price_la=null, price_std=69000`

The view incorrectly maps SIZE_LA (69000) to STD because 'SIZE_LA' doesn't match 'PRICE_LARGE'.

---

## SECTION B: APP CODE TRACE

### B.1 Menu Data Loading

**File:** [src/app/pos/page.tsx](../src/app/pos/page.tsx) (line ~340-360)

```typescript
// Load products and promotions in parallel
useEffect(() => {
  async function loadInitialData() {
    const [productsResult, promotionsResult] = await Promise.all([
      supabase.from("v_products_menu").select("*").order("name"),
      // ...
    ]);
    setProducts((productsResult.data ?? []) as ProductRow[]);
  }
  loadInitialData();
}, []);
```

### B.2 Available Sizes Logic

**File:** [src/app/pos/page.tsx](../src/app/pos/page.tsx) (line ~658-675)

```typescript
function getAvailableSizes(p: ProductRow | null): SizeKey[] {
  if (!p) return ["STD"];
  const sizes: SizeKey[] = [];
  if (p.price_phe != null) sizes.push("SIZE_PHE");  // null check!
  if (p.price_la != null) sizes.push("SIZE_LA");    // null check!
  if (p.price_std != null) sizes.push("STD");
  return sizes.length ? sizes : ["STD"];
}
```

**Behavior:** When view returns `price_phe=null, price_la=null`, only `["STD"]` is returned → UI hides size chips.

### B.3 Size Chip Display Condition

**File:** [src/app/pos/page.tsx](../src/app/pos/page.tsx) (line ~2227-2242)

```typescript
{availSizes.length >= 1 && (
  <ChipGroup
    options={[
      { value: "SIZE_PHE", label: "Phê", disabled: !availSizes.includes("SIZE_PHE") },
      { value: "SIZE_LA", label: "La", disabled: !availSizes.includes("SIZE_LA") },
      { value: "STD", label: "STD", disabled: !availSizes.includes("STD") },
    ].filter(opt => availSizes.includes(opt.value as SizeKey))}
    onChange={(size) => updateDraftLine(draft.id, { size: size as SizeKey })}
  />
)}
```

Only shows chips for sizes where price != null.

### B.4 Quote Payload

**File:** [src/app/pos/page.tsx](../src/app/pos/page.tsx) (line ~405-420)

```typescript
const quoteLines = useMemo(() => {
  const result = [];
  for (const l of lines) {
    if (l.product_id && isPositiveInt(l.qty)) {
      result.push({
        line_id: l.id,
        product_id: l.product_id,
        qty: Number(l.qty),
        price_key: l.size,  // Uses SIZE_PHE / SIZE_LA / STD
        options: { sugar: l.sugar_value_code || "" },
      });
    }
  }
  return result;
}, [lines]);
```

Quote uses correct size keys: `STD`, `SIZE_PHE`, `SIZE_LA`.

---

## SECTION C: FIX IMPLEMENTATION

### C.1 Root Cause Summary

| Issue | Evidence | Impact |
|-------|----------|--------|
| View CASE mapping is WRONG | Expects `PRICE_SMALL`/`PRICE_PHE`/`PRICE_LARGE`, data has `STD`/`SIZE_PHE`/`SIZE_LA` | ALL legacy prices map to STD |
| product_variants table EMPTY | 0 rows | No variant pricing used |
| Legacy fallback broken | CASE doesn't match, falls to ELSE | price_phe/price_la always null |

### C.2 Fix Strategy

**Minimal fix required:** Update the view's CASE mapping to match actual data.

**Two migration files:**
1. `20260131_fix_v_products_menu_mapping.sql` - Fix the CASE mapping in the view
2. `20260131_backfill_product_variants.sql` - (Optional) Create variant records from legacy for future

### C.3 Applied Migrations

See files:
- [supabase/migrations/20260131_fix_v_products_menu_mapping.sql](../supabase/migrations/20260131_fix_v_products_menu_mapping.sql)
- [supabase/migrations/20260131_backfill_product_variants.sql](../supabase/migrations/20260131_backfill_product_variants.sql)

---

## SECTION D: VERIFICATION QUERIES

After running the fix, verify with:

```sql
-- Should return products with correct prices
SELECT product_code, name, price_phe, price_la, price_std
FROM v_products_menu
WHERE category = 'DRINK'
ORDER BY name
LIMIT 10;

-- Expected: DRK_OLS should have price_phe=54000, price_la=69000
```

---

## SECTION E: TEST CHECKLIST

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | DRINK product shows Phê/La chips | DRK_OLS shows both size options | ⬜ |
| 2 | Selecting Phê uses correct price | Quote returns 54000 for PHE | ⬜ |
| 3 | Selecting La uses correct price | Quote returns 69000 for LA | ⬜ |
| 4 | Plus items (STD-only) work | DRK_PK shows only STD, price=108000 | ⬜ |
| 5 | Non-DRINK items work | CAKE/MERCHANDISE show STD | ⬜ |

---

## APPENDIX: Raw Diagnostic Output

```
=== SIZE SYNC DIAGNOSTICS ===

--- SECTION 1: COUNTS ---
Total active products: 87
Products with >=1 variant: 0
DRINK products total: 37
DRINK products missing SIZE_PHE or SIZE_LA: 37
Variants missing prices: 0

--- SECTION 4: LEGACY DATA CHECK ---
Legacy product_prices entries: 107
Legacy prices by key: { SIZE_PHE: 11, SIZE_LA: 12, STD: 84 }
Products with legacy prices but NO variants: 98

--- ROOT CAUSE VERIFICATION ---
product_variants count: 0
Distinct price_key values in product_prices: [ 'SIZE_PHE', 'SIZE_LA', 'STD' ]

View result for DRK_OLS (should have PHE=54000, LA=69000):
{
  product_code: 'DRK_OLS',
  price_phe: null,       <-- WRONG!
  price_la: null,        <-- WRONG!
  price_std: 69000       <-- SIZE_LA mapped to STD!
}

Legacy prices for DRK_OLS:
  SIZE_PHE: 54000
  SIZE_LA: 69000
```
