# Promotion Scopes - Quick Reference for Admin UI

## Overview
Promotions can now be scoped to specific **categories** (e.g., all DRINK) or **products** (e.g., only Espresso).

---

## Database Tables

### `promotion_scopes` (Category-level)
```sql
promotion_code | scope_type | category | is_included
---------------|------------|----------|------------
'DRINK10'      | 'CATEGORY' | 'DRINK'  | true
'NO_TOP'       | 'CATEGORY' | 'TOPPING'| false (excluded)
```

### `promotion_targets` (Product-level)
```sql
promotion_code | product_id      | is_enabled
---------------|-----------------|------------
'SPECIAL20'    | <espresso-uuid> | true
'SPECIAL20'    | <latte-uuid>    | true
```

---

## Business Rules

### DISCOUNT Promotions
1. **With scopes**: Applies only to lines matching scopes
2. **Without scopes**: Applies to **NONE** (0 lines) ⚠️
3. **Mixed scopes**: Eligible if `(in category OR in product) AND NOT excluded`

### RULE Promotions (e.g., FREE_UPSIZE_5)
1. **With scopes**: Counts only eligible lines toward `min_qty`
2. **Without scopes**: Counts all lines (backward compatible)

---

## Scope Matching Logic

```
Line is eligible if:
  (product_id IN includeProducts OR category IN includeCategories)
  AND
  (category NOT IN excludeCategories)
```

**Edge Cases**:
- `category = null` → normalized to "UNKNOWN" → not eligible
- No scopes → `eligible = []` for DISCOUNT (apply NONE)
- Excluded category overrides included product

---

## Category Normalization

**Why?** Database has inconsistent category values (DRINK vs DRK vs DO_UONG).

**Canonical Values**:
- `DRINK` - includes: DRINK, DRK, DO_UONG, ĐỒ UỐNG
- `CAKE` - includes: CAKE, BANH, BÁNH  
- `TOPPING` - includes: TOPPING, TOP
- `MERCHANDISE` - includes: MERCHANDISE, MERCH, MER
- `PCTC` - includes: PCTC
- `UNKNOWN` - null or unrecognized values

**Usage**: Admin UI should store canonical values (DRINK, CAKE, etc.) in `promotion_scopes.category`.

---

## Admin UI Integration

### 1. Promotion Form - Category Scopes

**Field**: Multi-select chips (already implemented)

**Options**: Load from `SELECT DISTINCT category FROM products WHERE is_active = true`

**Display**: Normalize to canonical values (DRINK, CAKE, TOPPING, MERCHANDISE, PCTC)

**Save**:
```typescript
// On save promotion
await fetch('/api/admin/promotions', {
  method: 'POST',
  body: JSON.stringify({
    code: 'DRINK10',
    name: '10% Off Drinks',
    promo_type: 'DISCOUNT',
    percent_off: 10,
    scopes: ['DRINK', 'CAKE'] // Array of categories
  })
});
```

**Backend**: Convert `scopes` array to `promotion_scopes` rows:
```sql
INSERT INTO promotion_scopes (promotion_code, scope_type, category, is_included)
VALUES 
  ('DRINK10', 'CATEGORY', 'DRINK', true),
  ('DRINK10', 'CATEGORY', 'CAKE', true);
```

---

### 2. Promotion Form - Product Targets (NEW - TODO)

**Field**: Multi-select dropdown or searchable list

**Options**: Load from `/api/admin/products` (all active products)

**Display**: Show `code - name` (e.g., "ESP - Espresso")

**Save**:
```typescript
// On save promotion with product targets
await fetch('/api/admin/promotions', {
  method: 'POST',
  body: JSON.stringify({
    code: 'SPECIAL20',
    name: '20% Off Selected Drinks',
    promo_type: 'DISCOUNT',
    percent_off: 20,
    product_targets: ['<espresso-uuid>', '<latte-uuid>'] // Array of product_ids
  })
});
```

**Backend**: Insert into `promotion_targets`:
```sql
INSERT INTO promotion_targets (promotion_code, product_id, is_enabled)
VALUES 
  ('SPECIAL20', '<espresso-uuid>', true),
  ('SPECIAL20', '<latte-uuid>', true);
```

---

### 3. Warning Messages

**Show warning if**:
- `promo_type = 'DISCOUNT'`
- No category scopes selected
- No product targets selected

**Message**:
```
⚠️ DISCOUNT không chọn scope sẽ không áp dụng (apply NONE).
Vui lòng chọn ít nhất 1 category hoặc product.
```

**Confirm dialog**:
```
Bạn có chắc muốn lưu DISCOUNT không có scope?
Promotion này sẽ KHÔNG áp dụng cho bất kỳ sản phẩm nào.
```

---

### 4. Display Existing Scopes

**API Response** (GET `/api/admin/promotions`):
```json
{
  "ok": true,
  "data": [
    {
      "code": "DRINK10",
      "name": "10% Off Drinks",
      "promo_type": "DISCOUNT",
      "percent_off": 10,
      "scopes": ["DRINK", "CAKE"],
      "product_targets": []
    },
    {
      "code": "SPECIAL20",
      "name": "20% Off Selected",
      "promo_type": "DISCOUNT",
      "percent_off": 20,
      "scopes": [],
      "product_targets": ["<espresso-uuid>", "<latte-uuid>"]
    }
  ]
}
```

**UI Display**:
```
Promotion: DRINK10
Scopes: 🏷️ DRINK, 🏷️ CAKE

Promotion: SPECIAL20  
Products: ☕ Espresso, ☕ Latte
```

---

## API Endpoints to Update

### POST/PATCH `/api/admin/promotions`

**Request Body** (add these fields):
```typescript
{
  // ... existing fields ...
  scopes?: string[],           // Category scopes (optional)
  product_targets?: string[],  // Product UUIDs (optional)
}
```

**Backend Logic**:
```typescript
// 1. Save promotion to `promotions` table
// 2. Delete existing scopes/targets for this promotion_code
// 3. Insert new scopes
if (scopes && scopes.length > 0) {
  await supabaseAdmin
    .from('promotion_scopes')
    .insert(
      scopes.map(cat => ({
        promotion_code: code,
        scope_type: 'CATEGORY',
        category: cat,
        is_included: true,
      }))
    );
}

// 4. Insert new product targets
if (product_targets && product_targets.length > 0) {
  await supabaseAdmin
    .from('promotion_targets')
    .insert(
      product_targets.map(pid => ({
        promotion_code: code,
        product_id: pid,
        is_enabled: true,
      }))
    );
}
```

---

### GET `/api/admin/promotions`

**Update to load and attach scopes**:
```typescript
// Load promotions
const { data: promotions } = await supabaseAdmin
  .from('promotions')
  .select('*')
  .order('priority');

// Load scopes for all promotions
const { data: scopes } = await supabaseAdmin
  .from('promotion_scopes')
  .select('promotion_code, category')
  .eq('scope_type', 'CATEGORY')
  .eq('is_included', true);

// Load product targets
const { data: targets } = await supabaseAdmin
  .from('promotion_targets')
  .select('promotion_code, product_id')
  .eq('is_enabled', true);

// Group and attach
const scopesByCode = {}; // { 'DRINK10': ['DRINK', 'CAKE'], ... }
const targetsByCode = {}; // { 'SPECIAL20': ['<uuid1>', '<uuid2>'], ... }

scopes?.forEach(s => {
  if (!scopesByCode[s.promotion_code]) scopesByCode[s.promotion_code] = [];
  scopesByCode[s.promotion_code].push(s.category);
});

targets?.forEach(t => {
  if (!targetsByCode[t.promotion_code]) targetsByCode[t.promotion_code] = [];
  targetsByCode[t.promotion_code].push(t.product_id);
});

return promotions.map(p => ({
  ...p,
  scopes: scopesByCode[p.code] || [],
  product_targets: targetsByCode[p.code] || [],
}));
```

---

## Testing Checklist for Admin UI

### Test 1: Create DISCOUNT with category scopes
- [ ] Create promotion: code=TEST_DRINK, type=DISCOUNT, percent_off=10
- [ ] Select scopes: DRINK, CAKE
- [ ] Save
- [ ] Reload page, verify scopes loaded correctly
- [ ] Test quote API with DRINK line → should get 10% off
- [ ] Test quote API with TOPPING line → should NOT get discount

### Test 2: Create DISCOUNT with no scopes
- [ ] Create promotion: code=TEST_NONE, type=DISCOUNT, percent_off=15
- [ ] Select NO scopes (empty)
- [ ] Should show warning: "⚠️ sẽ không áp dụng (apply NONE)"
- [ ] Confirm dialog appears
- [ ] Save
- [ ] Test quote API → should NOT apply discount to any line

### Test 3: Create DISCOUNT with product targets (TODO)
- [ ] Create promotion: code=TEST_SPECIFIC, type=DISCOUNT, percent_off=20
- [ ] Select NO category scopes
- [ ] Select products: Espresso, Latte
- [ ] Save
- [ ] Test quote API with Espresso → should get 20% off
- [ ] Test quote API with Cappuccino → should NOT get discount

### Test 4: Edit existing promotion
- [ ] Load promotion with scopes (e.g., DRINK10)
- [ ] Scopes chips should show selected: DRINK
- [ ] Change scopes: add CAKE, remove DRINK
- [ ] Save
- [ ] Reload, verify scopes updated

### Test 5: Mixed category + product scopes (TODO)
- [ ] Create promotion with both:
  - Category scope: CAKE
  - Product target: Espresso (DRINK category)
- [ ] Test quote:
  - Espresso line → discount (product target)
  - Tiramisu line (CAKE) → discount (category scope)
  - Latte line (DRINK) → NO discount (not in scopes)

---

## Quote API Response Format

**Frontend should parse `adjustments` array**:

```json
{
  "ok": true,
  "lines": [
    {
      "line_id": "1",
      "adjustments": [
        {"type": "DISCOUNT", "amount": 5000}
      ]
    }
  ],
  "meta": {
    "discount_percent": 10,
    "free_upsize_applied": false
  }
}
```

**UI Logic**:
```typescript
// Show promotion hint if any adjustment applied
const hasPromotion = line.adjustments?.some(a => 
  a.type === 'DISCOUNT' || a.type === 'FREE_UPSIZE'
);

if (hasPromotion) {
  // Show badge: "10% OFF" or "FREE UPSIZE"
}
```

---

## Common Issues & Solutions

### Issue 1: Hint disappears after selecting promotion
**Cause**: Promotion has scopes but no matching products in cart  
**Solution**: Check `meta.discount_percent` - if 0, promo not applied

### Issue 2: DISCOUNT not working but scopes look correct
**Cause**: Category mismatch (DB has DRK but scope uses DRINK)  
**Solution**: Use canonical categories (DRINK, CAKE, etc.) - normalization handles variants

### Issue 3: FREE_UPSIZE counts wrong qty
**Cause**: Promotion has scopes, now only counts eligible drinks  
**Solution**: This is correct behavior - remove scopes for old "all DRINK" behavior

### Issue 4: Can't save promotion without scopes
**Cause**: Validation prevents DISCOUNT with no scopes  
**Solution**: Add confirmation dialog, allow save but warn user

---

## Summary

✅ **DONE**:
- Category scopes (CATEGORY scope_type)
- Eligibility logic in pricing engine
- Category normalization
- Debug logging
- Time window validation
- FREE_UPSIZE respects scopes

📋 **TODO** (Admin UI):
- Add product target selector UI
- Update `/api/admin/promotions` to handle `product_targets` field
- Add tests for mixed scopes
- Update promotion list to show product targets

---

For detailed implementation guide, see: `PROMOTION_SCOPE_IMPLEMENTATION.md`  
For test cases, see: `PROMOTION_SCOPE_MATCHING_TEST.md`
