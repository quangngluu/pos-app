# Promotion Scope Matching - Test Checklist

## Implementation Summary

Fixed promotion scope matching with deterministic category normalization and enforced "DISCOUNT without scope => apply NONE" rule.

### Key Changes

1. **Enhanced `normalizeCategory()` function**:
   - Maps variants to canonical categories: DRINK, CAKE, TOPPING, MERCHANDISE, PCTC
   - Handles Vietnamese text (removes diacritics)
   - Maps: DRK/DO_UONG/ĐỒ UỐNG → DRINK
   - Maps: BANH/BÁNH → CAKE
   - Maps: TOP → TOPPING
   - Maps: MER/MERCH → MERCHANDISE
   - Returns "UNKNOWN" for null/unrecognized categories

2. **Scope eligibility logic**:
   - Loads both `is_included=true` and `is_included=false` scopes
   - Line eligible if: `normalized_category IN included AND NOT IN excluded`
   - **DISCOUNT with no included scopes**: `discountRate = 0` (apply NONE)

3. **Debug mode** (NODE_ENV !== 'production'):
   - Each line includes `debug.product_category` (raw value)
   - Each line includes `debug.normalized_category` (canonical value)
   - Each line includes `debug.is_eligible_for_promo` (boolean)

## Test Cases

### Test 1: DISCOUNT scoped to DRINK only

**Setup**:
- Promotion: `DISC_LE_10` (DISCOUNT, 10% off)
- Scopes: 1 row in `promotion_scopes`:
  - `promotion_code='DISC_LE_10'`
  - `scope_type='CATEGORY'`
  - `category='DRINK'`
  - `is_included=true`

**Test Data**:
```json
{
  "promotion_code": "DISC_LE_10",
  "lines": [
    {"line_id": "1", "product_id": "<drink-uuid>", "qty": 2, "price_key": "STD"},
    {"line_id": "2", "product_id": "<cake-uuid>", "qty": 1, "price_key": "STD"},
    {"line_id": "3", "product_id": "<topping-uuid>", "qty": 1, "price_key": "STD"}
  ]
}
```

**Expected Results**:
- ✅ Line 1 (DRINK): 10% discount applied
  - `unit_price_after = unit_price_before * 0.9`
  - `adjustments` includes `{"type": "DISCOUNT", "amount": ...}`
  - `debug.is_eligible_for_promo = true`
- ❌ Line 2 (CAKE): NO discount
  - `unit_price_after = unit_price_before`
  - No DISCOUNT adjustment
  - `debug.is_eligible_for_promo = false`
- ❌ Line 3 (TOPPING): NO discount
  - Same as Line 2

**Verify**:
- `totals.discount_total` = 10% of DRINK subtotal only
- `meta.discount_percent = 10`

---

### Test 2: DISCOUNT scoped to TOPPING only

**Setup**:
- Promotion: `TOP10` (DISCOUNT, 10% off)
- Scopes: 1 row:
  - `category='TOPPING'`, `is_included=true`

**Test Data**:
```json
{
  "promotion_code": "TOP10",
  "lines": [
    {"line_id": "1", "product_id": "<drink-uuid>", "qty": 2, "price_key": "STD"},
    {"line_id": "2", "product_id": "<topping-uuid>", "qty": 3, "price_key": "STD"}
  ]
}
```

**Expected Results**:
- ❌ Line 1 (DRINK): NO discount
- ✅ Line 2 (TOPPING): 10% discount applied
- `totals.discount_total` = 10% of TOPPING subtotal only

---

### Test 3: DISCOUNT with ZERO scopes (apply NONE)

**Setup**:
- Promotion: `DISC_NONE` (DISCOUNT, 15% off)
- Scopes: **NO ROWS** in `promotion_scopes` for this promotion_code

**Test Data**:
```json
{
  "promotion_code": "DISC_NONE",
  "lines": [
    {"line_id": "1", "product_id": "<drink-uuid>", "qty": 2, "price_key": "STD"},
    {"line_id": "2", "product_id": "<cake-uuid>", "qty": 1, "price_key": "STD"}
  ]
}
```

**Expected Results**:
- ❌ ALL lines: NO discount applied
- `totals.discount_total = 0`
- `meta.discount_percent = 0`
- All lines: `debug.is_eligible_for_promo = false`
- **Business Rule Applied**: "DISCOUNT without scope => apply NONE"

---

### Test 4: FREE_UPSIZE_5 with DRINK scope

**Setup**:
- Promotion: `FREE_UPSIZE_5` (RULE)
- Scopes: 1 row (optional but should work):
  - `category='DRINK'`, `is_included=true`

**Test Data**:
```json
{
  "promotion_code": "FREE_UPSIZE_5",
  "lines": [
    {"line_id": "1", "product_id": "<drink-phe-uuid>", "qty": 3, "price_key": "SIZE_PHE"},
    {"line_id": "2", "product_id": "<drink-phe-uuid>", "qty": 2, "price_key": "SIZE_PHE"}
  ]
}
```
*Total DRINK qty = 5 (meets min_qty)*

**Expected Results**:
- ✅ Both lines: FREE_UPSIZE applied
  - `display_price_key = "SIZE_LA"`
  - `charged_price_key = "SIZE_PHE"`
  - `adjustments` includes `{"type": "FREE_UPSIZE", "amount": ...}`
- `meta.free_upsize_applied = true`
- `meta.drink_qty = 5`

---

### Test 5: Category normalization (DRK → DRINK)

**Setup**:
- Product in DB: `category='DRK'` (variant spelling)
- Promotion: `DISC10` (DISCOUNT, 10%)
- Scopes: `category='DRINK'`, `is_included=true`

**Expected Results**:
- Product with `category='DRK'` normalized to "DRINK"
- Discount **IS** applied (normalization matches)
- `debug.product_category = "DRK"`
- `debug.normalized_category = "DRINK"`
- `debug.is_eligible_for_promo = true`

---

### Test 6: Vietnamese category (BÁNH → CAKE)

**Setup**:
- Product: `category='BÁNH'` (Vietnamese with diacritics)
- Promotion: DISCOUNT scoped to `category='CAKE'`

**Expected Results**:
- Diacritics removed: BÁNH → BANH → CAKE
- Discount **IS** applied
- `debug.product_category = "BÁNH"`
- `debug.normalized_category = "CAKE"`

---

### Test 7: NULL category product

**Setup**:
- Product: `category=NULL`
- Promotion: DISCOUNT scoped to DRINK

**Expected Results**:
- Normalized to "UNKNOWN"
- NOT eligible for any scope (UNKNOWN not in [DRINK])
- `debug.product_category = null`
- `debug.normalized_category = "UNKNOWN"`
- `debug.is_eligible_for_promo = false`

---

### Test 8: Excluded scope (is_included=false)

**Setup**:
- Promotion: `DISC_NO_TOP` (DISCOUNT, 10%)
- Scopes:
  - `category='DRINK'`, `is_included=true`
  - `category='TOPPING'`, `is_included=false` (excluded)

**Test Data**:
```json
{
  "promotion_code": "DISC_NO_TOP",
  "lines": [
    {"line_id": "1", "product_id": "<drink-uuid>", "qty": 1, "price_key": "STD"},
    {"line_id": "2", "product_id": "<topping-uuid>", "qty": 1, "price_key": "STD"}
  ]
}
```

**Expected Results**:
- ✅ Line 1 (DRINK): Discount applied (in included, not in excluded)
- ❌ Line 2 (TOPPING): NO discount (explicitly excluded)

---

### Test 9: PRODUCT scope (specific products only)

**Setup**:
- Promotion: `DISC_SPECIFIC` (DISCOUNT, 20%)
- NO category scopes
- Product targets: 2 rows in `promotion_targets`:
  - `product_id=<espresso-uuid>`, `is_enabled=true`
  - `product_id=<latte-uuid>`, `is_enabled=true`

**Test Data**:
```json
{
  "promotion_code": "DISC_SPECIFIC",
  "lines": [
    {"line_id": "1", "product_id": "<espresso-uuid>", "qty": 2, "price_key": "STD"},
    {"line_id": "2", "product_id": "<cappuccino-uuid>", "qty": 1, "price_key": "STD"},
    {"line_id": "3", "product_id": "<latte-uuid>", "qty": 1, "price_key": "STD"}
  ]
}
```

**Expected Results**:
- ✅ Line 1 (Espresso): 20% discount applied (in product target list)
- ❌ Line 2 (Cappuccino): NO discount (not in target list)
- ✅ Line 3 (Latte): 20% discount applied (in product target list)

---

### Test 10: Mixed CATEGORY + PRODUCT scopes

**Setup**:
- Promotion: `DISC_MIXED` (DISCOUNT, 15%)
- Category scope: `category='CAKE'`, `is_included=true`
- Product targets: `product_id=<espresso-uuid>`, `is_enabled=true`

**Test Data**:
```json
{
  "promotion_code": "DISC_MIXED",
  "lines": [
    {"line_id": "1", "product_id": "<espresso-uuid>", "qty": 1, "price_key": "STD"},
    {"line_id": "2", "product_id": "<latte-uuid>", "qty": 1, "price_key": "STD"},
    {"line_id": "3", "product_id": "<tiramisu-uuid>", "qty": 1, "price_key": "STD"}
  ]
}
```
*Assume: Espresso/Latte are DRINK category, Tiramisu is CAKE category*

**Expected Results**:
- ✅ Line 1 (Espresso): 15% discount (in product target list)
- ❌ Line 2 (Latte): NO discount (DRINK not in category scopes, not in product list)
- ✅ Line 3 (Tiramisu): 15% discount (CAKE in category scopes)

**Business Rule**: Eligible if (in category scopes OR in product targets) AND not excluded

---

### Test 11: FREE_UPSIZE with PRODUCT scope

**Setup**:
- Promotion: `FREE_UPSIZE_5` (RULE, min_qty=5)
- Product targets: 
  - `product_id=<americano-uuid>`, `is_enabled=true`
  - `product_id=<latte-uuid>`, `is_enabled=true`

**Test Data**:
```json
{
  "promotion_code": "FREE_UPSIZE_5",
  "lines": [
    {"line_id": "1", "product_id": "<americano-uuid>", "qty": 3, "price_key": "SIZE_PHE"},
    {"line_id": "2", "product_id": "<cappuccino-uuid>", "qty": 2, "price_key": "SIZE_PHE"},
    {"line_id": "3", "product_id": "<latte-uuid>", "qty": 1, "price_key": "SIZE_PHE"}
  ]
}
```
*Total DRINK qty = 6, but only 4 are eligible (Americano 3 + Latte 1)*

**Expected Results**:
- ❌ FREE_UPSIZE NOT applied (eligibleDrinkQty = 4 < 5)
- All lines charged at SIZE_PHE

**Adjust Test**: Add 1 more Latte:
```json
{"line_id": "3", "product_id": "<latte-uuid>", "qty": 2, "price_key": "SIZE_PHE"}
```
*Now eligibleDrinkQty = 5 (3 Americano + 2 Latte)*

**Expected Results**:
- ✅ FREE_UPSIZE applied
- Line 1 (Americano): display SIZE_LA, charge SIZE_PHE (eligible + upsize applied)
- Line 2 (Cappuccino): display SIZE_PHE, charge SIZE_PHE (NOT eligible, no upsize)
- Line 3 (Latte): display SIZE_LA, charge SIZE_PHE (eligible + upsize applied)

---

### Test 12: Time window validation

**Setup**:
- Promotion: `EXPIRED_PROMO` (DISCOUNT, 10%)
- `valid_from = '2026-01-01'`
- `valid_until = '2026-01-15'`
- Current date: 2026-01-28 (expired)

**Expected Results**:
- Promotion not applied
- `totals.discount_total = 0`
- `meta.discount_percent = 0`

---

## Manual Testing Steps

### Prerequisites
1. Database has products with various categories (DRINK, CAKE, TOPPING, etc.)
2. Products table has valid prices in `product_prices`
3. Admin UI can create/edit promotions with scopes

### Testing Procedure

1. **Create test promotion**:
   ```sql
   -- Via admin UI or direct SQL
   INSERT INTO promotions (code, name, promo_type, percent_off, is_active)
   VALUES ('TEST_DRINK10', 'Test 10% Drink', 'DISCOUNT', 10, true);
   
   INSERT INTO promotion_scopes (promotion_code, scope_type, category, is_included)
   VALUES ('TEST_DRINK10', 'CATEGORY', 'DRINK', true);
   ```

2. **Test via API**:
   ```bash
   curl -X POST http://localhost:3000/api/quote \
     -H "Content-Type: application/json" \
     -d '{
       "promotion_code": "TEST_DRINK10",
       "lines": [
         {"line_id": "1", "product_id": "<drink-uuid>", "qty": 2, "price_key": "STD"},
         {"line_id": "2", "product_id": "<cake-uuid>", "qty": 1, "price_key": "STD"}
       ]
     }'
   ```

3. **Verify response**:
   - Check `lines[0].adjustments` includes DISCOUNT
   - Check `lines[1].adjustments` does NOT include DISCOUNT
   - Check `totals.discount_total` > 0
   - In dev mode: check `debug` fields

4. **Test "no scope" case**:
   ```sql
   DELETE FROM promotion_scopes WHERE promotion_code='TEST_DRINK10';
   ```
   - Re-run quote API
   - Verify `discount_total = 0`

5. **Test normalization**:
   - Update product category to 'DRK'
   - Keep scope as 'DRINK'
   - Verify discount still applies (normalization works)

---

## SQL Queries for Testing

### Check existing scopes
```sql
SELECT 
  promotion_code,
  scope_type,
  category,
  is_included
FROM promotion_scopes
WHERE scope_type = 'CATEGORY'
ORDER BY promotion_code, category;
```

### Check product categories
```sql
SELECT DISTINCT category
FROM products
WHERE is_active = true
ORDER BY category;
```

### Create test promotion with scope
```sql
BEGIN;

INSERT INTO promotions (code, name, promo_type, percent_off, priority, is_active)
VALUES ('TEST_SCOPE', 'Test Scoped Discount', 'DISCOUNT', 15, 0, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  percent_off = EXCLUDED.percent_off;

DELETE FROM promotion_scopes 
WHERE promotion_code = 'TEST_SCOPE' AND scope_type = 'CATEGORY';

INSERT INTO promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES 
  ('TEST_SCOPE', 'CATEGORY', 'DRINK', true),
  ('TEST_SCOPE', 'CATEGORY', 'CAKE', true);

COMMIT;
```

---

## Expected Behavior Summary

| Scenario | Included Scopes | Product Category | Discount Applied? |
|----------|----------------|------------------|-------------------|
| DISCOUNT with DRINK scope | [DRINK] | DRINK | ✅ Yes |
| DISCOUNT with DRINK scope | [DRINK] | CAKE | ❌ No |
| DISCOUNT with DRINK scope | [DRINK] | NULL | ❌ No (UNKNOWN) |
| DISCOUNT with no scopes | [] | ANY | ❌ No (apply NONE) |
| DISCOUNT with DRINK scope | [DRINK] | DRK | ✅ Yes (normalized) |
| DISCOUNT with DRINK+CAKE | [DRINK, CAKE] | DRINK | ✅ Yes |
| DISCOUNT with DRINK+CAKE | [DRINK, CAKE] | TOPPING | ❌ No |
| DISCOUNT with excluded | [DRINK] excluded:[TOP] | DRINK | ✅ Yes |
| DISCOUNT with excluded | [DRINK] excluded:[TOP] | TOPPING | ❌ No |
| DISCOUNT with PRODUCT target | [] products:[espresso] | Espresso | ✅ Yes |
| DISCOUNT with PRODUCT target | [] products:[espresso] | Latte | ❌ No |
| Mixed CATEGORY+PRODUCT | [CAKE] products:[espresso] | Espresso | ✅ Yes |
| Mixed CATEGORY+PRODUCT | [CAKE] products:[espresso] | Tiramisu (CAKE) | ✅ Yes |
| Mixed CATEGORY+PRODUCT | [CAKE] products:[espresso] | Latte (DRINK) | ❌ No |
| Expired promotion | [DRINK] | DRINK | ❌ No (time window) |

---

## Files Modified

1. **`/src/app/lib/pricingEngine.ts`**:
   - Enhanced `normalizeCategory()` with comprehensive mapping
   - Load both CATEGORY scopes (included/excluded) and PRODUCT targets
   - Check eligibility: `(in category scopes OR in product targets) AND not in excluded categories`
   - Enforce "no included scopes => discountRate = 0"
   - Add debug fields in dev mode (NODE_ENV check)
   - **NEW**: Time window validation (valid_from/valid_until)
   - **NEW**: FREE_UPSIZE respects scopes (counts only eligible DRINK qty)
   - **NEW**: Server-side debug logging

2. **`/supabase/migrations/20260128_promotion_targets.sql`**:
   - New table for PRODUCT-level scoping
   - Foreign keys to promotions and products
   - RLS policies (public read, admin write)
   - Indexes for performance

---

## Debugging Tips

### Enable dev mode locally
```bash
# In terminal before starting dev server
export NODE_ENV=development
npm run dev
```

### Check debug output in quote response
```json
{
  "ok": true,
  "lines": [
    {
      "line_id": "1",
      "debug": {
        "product_category": "DRK",
        "normalized_category": "DRINK",
        "is_eligible_for_promo": true
      }
    }
  ]
}
```

### Common issues
- **Discount not applying**: Check if scope rows exist for promotion_code
- **Category mismatch**: Check normalization (print debug fields)
- **"Apply NONE" not working**: Verify no scope rows in DB for that promotion

---

## Build Status
✅ Build passed successfully
✅ No TypeScript errors
✅ All routes compile correctly
✅ Ready for testing
