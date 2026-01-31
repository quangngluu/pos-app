# Advanced Promotions System - Implementation Guide

## Overview
A comprehensive, future-proof promotions system supporting multiple discount types, flexible conditions, and multi-level targeting (Category/Subcategory/Product/Variant).

## ✅ Implementation Complete

### 1. Database Schema

#### Unified Scope Table: `promotion_scope_targets`
**Purpose:** Single table for all targeting levels (replaces 3 separate tables)

```sql
CREATE TABLE promotion_scope_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code TEXT NOT NULL REFERENCES promotions(code) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('CATEGORY', 'SUBCATEGORY', 'PRODUCT', 'VARIANT')),
  target_id TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_promotion_scope_targets_promotion_code ON promotion_scope_targets(promotion_code);
CREATE INDEX idx_promotion_scope_targets_target_type_id ON promotion_scope_targets(target_type, target_id);
CREATE INDEX idx_promotion_scope_targets_included ON promotion_scope_targets(promotion_code, is_included);
```

**Backfill Logic:**
- `promotion_scopes` (CATEGORY) → `target_type='CATEGORY', target_id=category`
- `promotion_targets` (PRODUCT) → `target_type='PRODUCT', target_id=product_id`
- `promotion_target_variants` (VARIANT) → `target_type='VARIANT', target_id=variant_id`

#### Rules Table: `promotion_rules`
**Purpose:** Define flexible promotion logic with conditions and actions

```sql
CREATE TABLE promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_code TEXT NOT NULL REFERENCES promotions(code) ON DELETE CASCADE,
  rule_order INTEGER NOT NULL DEFAULT 0,
  conditions JSONB, -- Optional conditions
  actions JSONB NOT NULL, -- Array of actions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_promotion_rules_promotion_code ON promotion_rules(promotion_code);
CREATE INDEX idx_promotion_rules_order ON promotion_rules(promotion_code, rule_order);
```

### 2. Rule Contract

#### Conditions (JSONB)
Conditions must ALL be met for rule to apply:

```typescript
{
  "min_order_value"?: number,    // e.g., 200000 (min subtotal)
  "min_qty"?: number,             // e.g., 5 (total items in order)
  "min_eligible_qty"?: number     // e.g., 3 (items matching scope)
}
```

#### Actions (JSONB Array)
Multiple actions can be defined per rule:

**1. PERCENT_OFF**
```typescript
{
  "type": "PERCENT_OFF",
  "percent": 10,                  // 10% off
  "apply_to": "ELIGIBLE_LINES"    // Only applies to scoped items
}
```

**2. AMOUNT_OFF**
```typescript
{
  "type": "AMOUNT_OFF",
  "amount": 20000,                // 20,000 VND off
  "apply_to": "ORDER_TOTAL" | "ELIGIBLE_LINES",
  "allocation": "PROPORTIONAL" | "EQUAL"  // How to distribute discount
}
```
- `ORDER_TOTAL`: Discount distributed across ALL order lines
- `ELIGIBLE_LINES`: Discount distributed only across eligible items
- `PROPORTIONAL`: Distributed by line value ratio (default)
- `EQUAL`: Distributed equally across lines

**3. AMOUNT_OFF_PER_ITEM**
```typescript
{
  "type": "AMOUNT_OFF_PER_ITEM",
  "amount": 5000,                 // 5,000 VND off per eligible item
  "max_items": 3                  // Optional: cap at 3 items
}
```

**4. FREE_ITEM**
```typescript
{
  "type": "FREE_ITEM",
  "variant_id": "<uuid>",         // Specific variant (SKU) to give
  "qty": 1,                       // Quantity of free items
  "max_per_order": 1              // Optional: limit per order
}
```

### 3. Scope Targeting (Multi-Level)

#### Targeting Hierarchy (Most Specific → Least Specific)
1. **VARIANT** - SKU-level targeting (e.g., "Phin Sữa Đá - Size Lớn")
2. **PRODUCT** - Base product (all sizes)
3. **SUBCATEGORY** - Menu section (e.g., "Cà Phê Truyền Thống")
4. **CATEGORY** - Top-level category (e.g., "DRINK", "CAKE")

#### Include/Exclude Logic
- `is_included: true` → Item is eligible for promotion
- `is_included: false` → Item is explicitly excluded (overrides includes)
- **Evaluation order:** Check VARIANT → PRODUCT → SUBCATEGORY → CATEGORY
- **First match wins** at each level

#### Example: Complex Targeting
```typescript
// Promotion: "20% off all drinks except Phin Sữa Đá"
Scopes:
[
  { target_type: "CATEGORY", target_id: "DRINK", is_included: true },
  { target_type: "PRODUCT", target_id: "<phin-sua-da-id>", is_included: false }
]
```

### 4. PricingEngine Updates

#### Key Changes
**File:** `src/app/lib/pricingEngine.ts`

**New Eligibility Checking:**
```typescript
isLineEligible(productId, productCategory, priceKey, subcategoryId) {
  // Multi-level checking: VARIANT → PRODUCT → SUBCATEGORY → CATEGORY
  // Returns true if eligible, false if excluded
}
```

**Condition Evaluation:**
```typescript
// Calculate eligible totals
const eligibleTotal = eligible lines subtotal
const eligibleQty = eligible lines quantity
const totalQty = all lines quantity

// Check conditions
if (min_order_value && subtotal < min_order_value) → skip rule
if (min_qty && totalQty < min_qty) → skip rule
if (min_eligible_qty && eligibleQty < min_eligible_qty) → skip rule
```

**Action Application:**
- Rules applied in `rule_order` sequence
- Each action modifies `unit_price_after` and `line_total_after`
- Adjustments tracked in `line.adjustments[]` array
- Free items added to separate `free_items[]` array in response

**Backward Compatibility:**
- FREE_UPSIZE hardcoded rule still works (display LA, charge PHE)
- Legacy DISCOUNT promotions without rules use `percent_off` field
- Old scope tables (`promotion_scopes`, `promotion_targets`, `promotion_target_variants`) still work as fallback

### 5. Admin APIs

#### A. Promotion Rules Management

**GET** `/api/admin/promotions/rules?promotion_code=CODE`
- List all rules for a promotion
- Returns: `{ ok: true, rules: [...] }`

**POST** `/api/admin/promotions/rules`
```typescript
{
  "promotion_code": "SUMMER_SALE",
  "rule_order": 0,
  "conditions": {
    "min_order_value": 100000,
    "min_eligible_qty": 2
  },
  "actions": [
    {
      "type": "PERCENT_OFF",
      "percent": 15,
      "apply_to": "ELIGIBLE_LINES"
    }
  ]
}
```
Returns: `{ ok: true, data: {...} }`

**PATCH** `/api/admin/promotions/rules`
```typescript
{
  "id": "<rule-uuid>",
  "patch": {
    "rule_order": 1,
    "conditions": { "min_order_value": 150000 }
  }
}
```

#### B. Scope Targets Management

**GET** `/api/admin/promotions/scopes?promotion_code=CODE&target_type=CATEGORY`
- List scope targets (optional filter by type)
- Returns: `{ ok: true, scopes: [...] }`

**POST** `/api/admin/promotions/scopes`
```typescript
{
  "promotion_code": "SUMMER_SALE",
  "targets": [
    { "target_type": "CATEGORY", "target_id": "DRINK", "is_included": true },
    { "target_type": "PRODUCT", "target_id": "<uuid>", "is_included": false }
  ]
}
```
Returns: `{ ok: true, data: [...], inserted: 2 }`

**PATCH** `/api/admin/promotions/scopes`
```typescript
{
  "id": "<scope-uuid>",
  "is_included": false  // Toggle include/exclude
}
```

**DELETE** `/api/admin/promotions/scopes`
```typescript
{
  "ids": ["<uuid1>", "<uuid2>"]  // Bulk delete
}
```

#### C. Promotions Management (Existing)

**GET** `/api/admin/promotions?q=search`
- Returns promotions with scopes

**POST** `/api/admin/promotions`
- Creates promotion (with optional legacy scopes)

**PATCH** `/api/admin/promotions`
- Updates promotion

### 6. Migration Guide

#### Step 1: Run SQL Migration
```bash
psql $DATABASE_URL -f supabase/migrations/20260131_promotion_scope_targets.sql
```

**What it does:**
1. Creates `promotion_scope_targets` table
2. Backfills from `promotion_scopes`, `promotion_targets`, `promotion_target_variants`
3. Creates/updates `promotion_rules` table
4. Adds indexes for performance

#### Step 2: Verify Data Migration
```sql
-- Check backfill succeeded
SELECT COUNT(*) FROM promotion_scope_targets;

-- Sample data
SELECT * FROM promotion_scope_targets LIMIT 10;

-- Check by type
SELECT target_type, COUNT(*) 
FROM promotion_scope_targets 
GROUP BY target_type;
```

#### Step 3: Create First Rule-Based Promotion

**Example: "Buy 2+ drinks, get 10% off"**

```typescript
// 1. Create promotion (use existing API)
POST /api/admin/promotions
{
  "code": "DRINK_DISCOUNT",
  "name": "Drink Discount",
  "promo_type": "RULE",
  "is_active": true
}

// 2. Add scope (drinks only)
POST /api/admin/promotions/scopes
{
  "promotion_code": "DRINK_DISCOUNT",
  "targets": [
    { "target_type": "CATEGORY", "target_id": "DRINK", "is_included": true }
  ]
}

// 3. Add rule
POST /api/admin/promotions/rules
{
  "promotion_code": "DRINK_DISCOUNT",
  "rule_order": 0,
  "conditions": {
    "min_eligible_qty": 2
  },
  "actions": [
    {
      "type": "PERCENT_OFF",
      "percent": 10,
      "apply_to": "ELIGIBLE_LINES"
    }
  ]
}
```

### 7. Usage Examples

#### Example 1: Tiered Discount
"Spend 100k get 10% off, spend 200k get 20% off"

```typescript
// Rule 1 (lower tier - runs first)
{
  "rule_order": 0,
  "conditions": { "min_order_value": 100000 },
  "actions": [{ "type": "PERCENT_OFF", "percent": 10, "apply_to": "ELIGIBLE_LINES" }]
}

// Rule 2 (higher tier - overrides rule 1)
{
  "rule_order": 1,
  "conditions": { "min_order_value": 200000 },
  "actions": [{ "type": "PERCENT_OFF", "percent": 20, "apply_to": "ELIGIBLE_LINES" }]
}
```

#### Example 2: Buy X Get Y Free
"Buy 3 drinks, get 1 free cake"

```typescript
{
  "conditions": { "min_eligible_qty": 3 },
  "actions": [{
    "type": "FREE_ITEM",
    "variant_id": "<cake-variant-uuid>",
    "qty": 1,
    "max_per_order": 1
  }]
}

// Scopes: CATEGORY=DRINK (is_included=true)
```

#### Example 3: Per-Item Discount
"First 2 eligible items: 5k off each"

```typescript
{
  "actions": [{
    "type": "AMOUNT_OFF_PER_ITEM",
    "amount": 5000,
    "max_items": 2
  }]
}
```

#### Example 4: Fixed Amount Off Order
"20k off orders over 150k"

```typescript
{
  "conditions": { "min_order_value": 150000 },
  "actions": [{
    "type": "AMOUNT_OFF",
    "amount": 20000,
    "apply_to": "ORDER_TOTAL",
    "allocation": "PROPORTIONAL"
  }]
}
```

### 8. Response Format

**Quote Response with Rules:**
```typescript
{
  "ok": true,
  "lines": [
    {
      "line_id": "uuid",
      "product_id": "uuid",
      "qty": 2,
      "display_price_key": "SIZE_PHE",
      "charged_price_key": "SIZE_PHE",
      "unit_price_before": 45000,
      "unit_price_after": 40500,  // After 10% off
      "line_total_before": 90000,
      "line_total_after": 81000,
      "adjustments": [
        {
          "type": "PERCENT_OFF",
          "amount": 9000,
          "details": "10% off eligible items"
        }
      ]
    }
  ],
  "free_items": [
    {
      "line_id": "free-<uuid>",
      "product_id": "uuid",
      "qty": 1,
      "unit_price_before": 30000,
      "unit_price_after": 0,
      "line_total_before": 30000,
      "line_total_after": 0,
      "is_free_item": true,
      "adjustments": [
        {
          "type": "FREE_ITEM",
          "amount": 30000,
          "details": "Free gift item (1x)"
        }
      ]
    }
  ],
  "totals": {
    "subtotal_before": 90000,
    "discount_total": 39000,  // 9000 + 30000
    "grand_total": 51000
  },
  "meta": {
    "rules_applied": ["PERCENT_OFF_10", "FREE_ITEM_<uuid>"],
    "conditions_met": {
      "min_eligible_qty_2": true
    }
  }
}
```

### 9. Business Rules

#### Critical Rule: No Scopes = No Discount
```typescript
// If promo has NO include scopes (any type):
if (!hasIncludeScope) {
  // DISCOUNT does NOT apply
  // Rule actions do NOT apply
  // Returns: meta.discount_percent = 0
}
```

This prevents accidental "apply to everything" promotions.

#### Legacy FREE_UPSIZE Support
- Hardcoded rule still works (backward compatible)
- Checks if `promotion.code === "FREE_UPSIZE_5"`
- Displays LA but charges PHE for eligible DRINK items
- Counts only eligible drinks towards min_qty

### 10. Performance Considerations

**Indexes Created:**
- `promotion_scope_targets(promotion_code)` - Fast scope lookup
- `promotion_scope_targets(target_type, target_id)` - Fast target matching
- `promotion_rules(promotion_code, rule_order)` - Ordered rule loading

**Optimization Tips:**
- Use CATEGORY scopes for broad promotions (fewer DB rows)
- Use PRODUCT/VARIANT scopes for targeted promotions
- Keep rule count per promotion reasonable (<5 rules)
- Cache promotion data at app level (refresh on promotion change)

### 11. Testing Checklist

- [ ] **Migration runs successfully**
  ```sql
  SELECT COUNT(*) FROM promotion_scope_targets;
  SELECT COUNT(*) FROM promotion_rules;
  ```

- [ ] **Backward compatibility**
  - [ ] Legacy DISCOUNT promotions still work
  - [ ] FREE_UPSIZE still works (display LA, charge PHE)
  - [ ] Old scope tables still work as fallback

- [ ] **New rule types**
  - [ ] PERCENT_OFF applies correctly
  - [ ] AMOUNT_OFF distributes proportionally
  - [ ] AMOUNT_OFF_PER_ITEM caps at max_items
  - [ ] FREE_ITEM adds to separate array

- [ ] **Conditions**
  - [ ] min_order_value blocks rule if not met
  - [ ] min_qty checks total order quantity
  - [ ] min_eligible_qty checks scoped items only

- [ ] **Multi-level targeting**
  - [ ] VARIANT-level override works
  - [ ] PRODUCT-level excludes work
  - [ ] SUBCATEGORY targeting works
  - [ ] CATEGORY targeting works

- [ ] **Admin APIs**
  - [ ] GET/POST/PATCH rules endpoints work
  - [ ] GET/POST/PATCH/DELETE scopes endpoints work
  - [ ] Bulk operations work correctly

- [ ] **No scopes = no discount rule**
  - [ ] Promotion with empty scopes returns 0 discount
  - [ ] Debug meta shows `hasIncludeScope: false`

### 12. Deployment Steps

1. **Backup database** (precaution)
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

2. **Run migration**
   ```bash
   psql $DATABASE_URL -f supabase/migrations/20260131_promotion_scope_targets.sql
   ```

3. **Verify migration**
   ```sql
   \d promotion_scope_targets
   \d promotion_rules
   SELECT COUNT(*) FROM promotion_scope_targets;
   ```

4. **Test existing promotions**
   - Test FREE_UPSIZE_5 promotion still works
   - Test any legacy DISCOUNT promotions
   - Verify POS UI still works

5. **Create first rule-based promotion** (test)
   - Use admin APIs to create test promotion
   - Test in POS with /api/quote
   - Verify adjustments and free_items

6. **Monitor logs**
   - Check for `[PricingEngine]` debug logs (dev mode)
   - Watch for any errors in quote calculations

## Success Criteria

✅ Migration completes without errors  
✅ All existing promotions continue working  
✅ New rule-based promotions can be created  
✅ Multi-level targeting works correctly  
✅ Admin APIs respond with proper `{ok, data/error}` format  
✅ POS UI displays prices correctly with new system  
✅ No breaking changes to existing flows

## Support & Troubleshooting

**Issue: "No scopes found for promotion"**
- Check `promotion_scope_targets` table has data
- Fallback to legacy tables should work automatically

**Issue: "Rule not applying"**
- Check conditions are met (debug: `meta.conditions_met`)
- Verify scopes are correct (`hasIncludeScope: true`)
- Check rule_order (lower runs first)

**Issue: "Free item not showing"**
- Check `variant_id` exists in `product_variants`
- Verify variant has price in `product_variant_prices`
- Check `free_items` array in response (separate from `lines`)

**Issue: "Discount applying to excluded items"**
- Check exclude scopes have `is_included: false`
- Verify eligibility logic: VARIANT → PRODUCT → SUBCATEGORY → CATEGORY

For more help, check:
- [VARIANT_PRICING_DEPLOYMENT.md](./VARIANT_PRICING_DEPLOYMENT.md) - Base pricing system
- [IMPLEMENTATION_VERIFICATION.md](./IMPLEMENTATION_VERIFICATION.md) - Code verification
