# SIZE SYNC FIX - TEST CHECKLIST

**Date:** 2026-01-31  
**Related:** [DEBUG_SIZE_SYNC_REPORT.md](./DEBUG_SIZE_SYNC_REPORT.md)

---

## Pre-Fix Verification (Run Before Migration)

Run these queries in Supabase SQL Editor to baseline current state:

```sql
-- Count problematic products
SELECT 
  (SELECT COUNT(*) FROM v_products_menu WHERE category = 'DRINK' AND (price_phe IS NULL OR price_la IS NULL)) as drinks_missing_sizes,
  (SELECT COUNT(*) FROM product_variants pv WHERE pv.is_active = true AND NOT EXISTS (SELECT 1 FROM product_variant_prices pvp WHERE pvp.variant_id = pv.id)) as variants_missing_prices;
```

Expected (before fix):
- drinks_missing_sizes: > 0
- variants_missing_prices: > 0

---

## Migration Steps

### Step 1: Backfill Missing Variants
```bash
# Run in Supabase SQL Editor or via migration
supabase migration up --file 20260131_fix_missing_variants.sql
```

### Step 2: Fix View (Gap Fill Logic)
```bash
supabase migration up --file 20260131_fix_v_products_menu_view.sql
```

---

## Post-Fix Verification

### ✅ Test 1: DRINK với cả Phê+La variant

**Steps:**
1. Open POS page
2. Click "+ Thêm món"
3. Find a DRINK product (e.g., "Trà Đào Cam Sả")
4. Click to add it to draft

**Expected:**
- [ ] Size picker shows 2 options: "Phê" and "La"
- [ ] Can switch between sizes
- [ ] Price updates when size changes

**Query to verify:**
```sql
SELECT name, price_phe, price_la, price_std 
FROM v_products_menu 
WHERE category = 'DRINK' AND price_phe IS NOT NULL AND price_la IS NOT NULL
LIMIT 5;
```

---

### ✅ Test 2: DRINK chỉ có STD variant

**Steps:**
1. Find a DRINK product that only has STD (if any exist)
2. Add to draft

**Expected:**
- [ ] Size picker shows only "STD" or is hidden
- [ ] No crash/error

**Query to find test product:**
```sql
SELECT name, price_phe, price_la, price_std 
FROM v_products_menu 
WHERE category = 'DRINK' 
  AND price_std IS NOT NULL 
  AND price_phe IS NULL 
  AND price_la IS NULL
LIMIT 5;
```

---

### ✅ Test 3: CAKE chỉ có STD

**Steps:**
1. Find a CAKE product
2. Add to draft

**Expected:**
- [ ] Size picker is hidden (only STD available)
- [ ] Price displays correctly

**Query to verify:**
```sql
SELECT name, price_phe, price_la, price_std 
FROM v_products_menu 
WHERE category = 'CAKE'
LIMIT 5;
```

---

### ✅ Test 4: Quote FREE_UPSIZE 5 drinks

**Steps:**
1. Add 5 DRINK items with size "Phê"
2. Select promotion "FREE_UPSIZE_5"
3. Check quote result

**Expected:**
- [ ] Meta shows `free_upsize_applied: true`
- [ ] Lines show `display_price_key: SIZE_LA`
- [ ] Lines show `charged_price_key: SIZE_PHE`
- [ ] Price charged is Phê price, not La price

**API test:**
```bash
curl -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{
    "promotion_code": "FREE_UPSIZE_5",
    "lines": [
      {"line_id": "11111111-1111-1111-1111-111111111111", "product_id": "<DRINK_ID>", "qty": 5, "price_key": "SIZE_PHE"}
    ]
  }'
```

---

### ✅ Test 5: Order create với size LA

**Steps:**
1. Add a DRINK with size "La"
2. Fill required fields (phone, address, store)
3. Click "Đặt đơn"
4. Check order_lines in database

**Expected:**
- [ ] Order created successfully
- [ ] `order_lines.price_key_snapshot = 'SIZE_LA'`
- [ ] `order_lines.unit_price_snapshot` matches La price

**Query to verify:**
```sql
SELECT 
  ol.product_name_snapshot,
  ol.price_key_snapshot,
  ol.unit_price_snapshot,
  ol.qty
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
ORDER BY o.created_at DESC
LIMIT 5;
```

---

## Edge Case Tests

### ✅ Test 6: Product card shows size hint chips

**Steps:**
1. Open Product Picker modal
2. Look at DRINK product cards

**Expected:**
- [ ] Cards with both PHE+LA show "Phê" and "La" chips
- [ ] Badge count shows when product is in draft

---

### ✅ Test 7: Duplicate products in order

**Steps:**
1. Add same DRINK twice with different sizes (Phê, La)
2. Check quote result

**Expected:**
- [ ] Both lines show in quote
- [ ] Each line has correct price for its size
- [ ] line_id mapping works correctly

---

### ✅ Test 8: Missing price warning

**Steps:**
1. If a product has variant but no price, add to order

**Expected:**
- [ ] Red warning: "Quote báo thiếu giá cho line này"
- [ ] "Đặt đơn" button is disabled

---

## Final Verification Query

Run after all tests pass:

```sql
SELECT 
  'drinks_missing_sizes' as metric,
  (SELECT COUNT(*) FROM v_products_menu WHERE category = 'DRINK' AND (price_phe IS NULL OR price_la IS NULL))::text as value
UNION ALL
SELECT 
  'variants_missing_prices',
  (SELECT COUNT(*) FROM product_variants pv WHERE pv.is_active = true AND NOT EXISTS (SELECT 1 FROM product_variant_prices pvp WHERE pvp.variant_id = pv.id))::text;
```

Expected (after fix):
- drinks_missing_sizes: 0 (or very few edge cases)
- variants_missing_prices: 0

---

## Rollback Plan

If issues found, revert view to original:

```sql
-- Restore original view (without gap fill)
DROP VIEW IF EXISTS public.v_products_menu CASCADE;

-- Re-run original migration
-- File: supabase/migrations/202601310300_products_menu_view_update.sql
```

---

## Sign-off

| Test | Status | Tester | Date |
|------|--------|--------|------|
| Test 1: DRINK với Phê+La | ⬜ | | |
| Test 2: DRINK chỉ STD | ⬜ | | |
| Test 3: CAKE chỉ STD | ⬜ | | |
| Test 4: FREE_UPSIZE 5 drinks | ⬜ | | |
| Test 5: Order create size LA | ⬜ | | |
| Test 6: Size hint chips | ⬜ | | |
| Test 7: Duplicate products | ⬜ | | |
| Test 8: Missing price warning | ⬜ | | |

**Overall Status:** ⬜ Not Started / 🔄 In Progress / ✅ Passed / ❌ Failed
