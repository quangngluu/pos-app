# Promotion Category Scopes Implementation

## Overview
Implemented category-based scoping for DISCOUNT promotions using the `promotion_scopes` table. DISCOUNT promotions now only apply to selected categories, with "no categories = no discount" rule.

## Business Rules

### DISCOUNT Promotions
- **With scopes**: Only discount lines matching selected categories
- **No scopes**: discount_total = 0 (apply NONE)
- **Warning**: UI shows clear warning when saving DISCOUNT with no categories

### RULE Promotions
- **No change**: FREE_UPSIZE and other RULE types work as before
- **No scopes needed**: Category scopes don't apply to RULE promotions

### Scope Definition
- `scope_type = 'CATEGORY'`
- `category = string` (e.g., DRINK, CAKE, TOPPING, MERCHANDISE)
- `is_included = true` (whitelist approach)

## Implementation Details

### 1. Database Schema
Uses existing `promotion_scopes` table:
```sql
promotion_scopes (
  promotion_code text,
  scope_type text,
  category text,
  is_included boolean
)
```

### 2. API Routes (`/api/admin/promotions`)

**GET Endpoint**:
- Loads promotions with their scopes
- Returns `scopes: string[]` array for each promotion
- Joins `promotion_scopes` where `scope_type='CATEGORY'` and `is_included=true`

**POST Endpoint**:
- Accepts `scopes: string[]` in request body
- Inserts promotion first
- Then inserts scope rows if promo_type is DISCOUNT

**PATCH Endpoint**:
- Accepts `scopes: string[]` in request body
- Deletes all existing CATEGORY scopes for the promotion
- Inserts new scopes based on selection
- Only applies if promo_type is DISCOUNT

### 3. Admin UI (`/admin` - Promotions Tab)

**Category Selection**:
- Only shown when `promo_type === 'DISCOUNT'`
- Loads distinct categories from active products
- Sorted: DRINK, CAKE, TOPPING, MERCHANDISE first, then alphabetical
- Multi-select chip UI (click to toggle)
- Selected categories shown with blue background and checkmark

**Loading States**:
- Fetches categories on modal open
- Pre-selects existing scopes when editing
- Shows warning if no categories selected

**Validation**:
- If DISCOUNT with no categories: shows confirm dialog
- Message: "⚠️ DISCOUNT không chọn category sẽ không áp dụng (apply NONE). Bạn có chắc muốn lưu?"
- Allows save but warns user clearly

### 4. Pricing Engine (`src/app/lib/pricingEngine.ts`)

**Already Implemented** (verified existing code):
- Loads scopes when loading promotions
- Builds `normalizedDiscountCategories: string[]`
- Business rule: `discountRate = 0` if no scopes
- Only applies discount to lines where:
  - `product.category ∈ normalizedDiscountCategories`
- Lines outside scope: no discount applied
- Output reflects correct totals and line-level pricing

**Normalization**:
- "TOPPING" → "TOP" (for consistency)
- All categories uppercased
- Handles null/undefined categories

## Testing Checklist

### Test Case 1: DISCOUNT with DRINK only
1. Create/Edit promotion: Type=DISCOUNT, percent_off=10
2. Select only "DRINK" category
3. Save promotion
4. Create quote with:
   - 2x DRINK (category=DRINK)
   - 1x CAKE (category=CAKE)
   - 1x TOPPING (category=TOPPING)
5. **Expected**:
   - DRINK items: 10% discount applied
   - CAKE: no discount (full price)
   - TOPPING: no discount (full price)
   - `discount_total` = 10% of DRINK subtotal only

### Test Case 2: DISCOUNT with no categories
1. Create/Edit promotion: Type=DISCOUNT, percent_off=10
2. Don't select any categories
3. UI shows warning: "⚠️ DISCOUNT không chọn category sẽ không áp dụng (apply NONE)"
4. Confirm save dialog appears
5. Save promotion
6. Create quote with any products
7. **Expected**:
   - `discount_total = 0`
   - All products at full price
   - No discount applied to any line

### Test Case 3: DISCOUNT with multiple categories
1. Create promotion: Type=DISCOUNT, percent_off=15
2. Select "DRINK" and "CAKE"
3. Save promotion
4. Create quote with DRINK, CAKE, TOPPING
5. **Expected**:
   - DRINK: 15% discount
   - CAKE: 15% discount
   - TOPPING: no discount (full price)

### Test Case 4: Edit promotion - change scopes
1. Edit existing DISCOUNT promotion
2. Current scopes: DRINK
3. Change to: DRINK, TOPPING
4. Save
5. Create quote
6. **Expected**:
   - DRINK: discount applied
   - TOPPING: discount applied (new)
   - CAKE: no discount

### Test Case 5: RULE promotion (FREE_UPSIZE)
1. Create/Edit RULE promotion (FREE_UPSIZE_5)
2. No category selection shown in UI
3. Save promotion
4. Create quote with 5+ drinks, size PHE
5. **Expected**:
   - FREE_UPSIZE still works correctly
   - No scope interference
   - Display=LA, Charged=PHE

### Test Case 6: Category sorting
1. Open create promotion modal
2. Set type to DISCOUNT
3. **Expected**:
   - Categories shown in order:
     1. DRINK
     2. CAKE
     3. TOPPING
     4. MERCHANDISE
     5. Other categories (alphabetical)

## API Examples

### Create DISCOUNT with scopes
```bash
POST /api/admin/promotions
{
  "code": "DRINK10",
  "name": "10% off drinks",
  "promo_type": "DISCOUNT",
  "percent_off": 10,
  "priority": 0,
  "is_active": true,
  "scopes": ["DRINK"]
}
```

### Update scopes
```bash
PATCH /api/admin/promotions
{
  "code": "DRINK10",
  "patch": {
    "name": "10% off drinks and cake"
  },
  "scopes": ["DRINK", "CAKE"]
}
```

### Get promotions (includes scopes)
```bash
GET /api/admin/promotions

Response:
{
  "ok": true,
  "promotions": [
    {
      "code": "DRINK10",
      "promo_type": "DISCOUNT",
      "percent_off": 10,
      "scopes": ["DRINK", "CAKE"]
    }
  ]
}
```

## Quote API Examples

### Quote with scoped DISCOUNT
```bash
POST /api/quote
{
  "promotion_code": "DRINK10",
  "lines": [
    { "line_id": "1", "product_id": "drink-uuid", "qty": 2, "price_key": "STD" },
    { "line_id": "2", "product_id": "cake-uuid", "qty": 1, "price_key": "STD" }
  ]
}

Response (if DRINK10 has scope=DRINK only):
{
  "ok": true,
  "lines": [
    {
      "line_id": "1",
      "product_id": "drink-uuid",
      "qty": 2,
      "unit_price_before": 45000,
      "unit_price_after": 40500,
      "line_total_after": 81000,
      "adjustments": [{ "type": "DISCOUNT", "amount": 9000 }]
    },
    {
      "line_id": "2",
      "product_id": "cake-uuid",
      "qty": 1,
      "unit_price_before": 65000,
      "unit_price_after": 65000,
      "line_total_after": 65000
    }
  ],
  "totals": {
    "subtotal_before": 155000,
    "discount_total": 9000,
    "grand_total": 146000
  }
}
```

## Files Modified

1. **`/src/app/api/admin/promotions/route.ts`**
   - Added `scopes` to validation schemas
   - GET: loads and attaches scopes to promotions
   - POST: inserts scopes for DISCOUNT promotions
   - PATCH: replaces scopes atomically

2. **`/src/app/admin/page.tsx`**
   - Added `scopes` to Promotion type
   - PromotionModal: loads categories from products
   - Category selection UI (chip-based multi-select)
   - Warning message for DISCOUNT with no scopes
   - Confirm dialog before saving DISCOUNT with no scopes

3. **`/src/app/lib/pricingEngine.ts`**
   - Already implemented scope loading and filtering
   - Business rule: no scopes = no discount

## Build Status
✅ Build passed successfully
✅ No TypeScript errors
✅ All routes compile correctly

## Manual Testing Steps

1. **Login** as admin user
2. **Navigate** to `/admin` → Promotions tab
3. **Create DISCOUNT promotion**:
   - Click "+ Create Promotion"
   - Code: TEST_DRINK10
   - Name: Test 10% Drink Discount
   - Type: DISCOUNT
   - Percent Off: 10
   - Select only "DRINK" category
   - Save
4. **Test in POS** or via API:
   - Add DRINK items → should show 10% discount
   - Add CAKE items → should be full price
5. **Edit promotion**:
   - Add "CAKE" to scopes
   - Save
   - Test again → CAKE should now get discount
6. **Test no scopes**:
   - Edit promotion
   - Deselect all categories
   - Warning appears
   - Confirm save
   - Test quote → discount_total should be 0

## Known Behavior

- **RULE promotions**: Scopes UI not shown (intentional - not needed)
- **Empty scopes**: Valid state for DISCOUNT (means apply to nothing)
- **Category normalization**: TOPPING → TOP in engine (for consistency)
- **Whitelist approach**: Only categories in scopes get discount
- **Atomic updates**: PATCH replaces all scopes (delete + insert)
