# Test Checklist: Duplicate Product Lines

## ✅ System Status

The quote mapping bug has been **ALREADY FIXED** in the current implementation:

### Implementation Details:

1. **Client (pos/page.tsx)**:
   - ✅ Sends `line_id: l.id` in quote request payload (line 369)
   - ✅ Maps quote results by `line_id`: `Map<line_id, QuoteLine>` (line 455-459)
   - ✅ All lookups use `quoteLineMap.get(l.id)` instead of product_id (5 locations verified)
   - ✅ Free upsize logic checks per-line adjustments (line 477)
   - ✅ Order creation uses line_id for quote lookup (line 815)

2. **API (src/app/api/quote/route.ts)**:
   - ✅ Schema validates `line_id: z.string().uuid()` (line 12)
   - ✅ Passes line_id to pricingEngine (line 33)

3. **Pricing Engine (src/app/lib/pricingEngine.ts)**:
   - ✅ QuoteLine type includes `line_id: string` (line 21)
   - ✅ QuoteLineResult preserves `line_id` in all results (line 29, 227)
   - ✅ Each line processed independently with unique line_id

4. **Orders API (src/app/api/orders/route.ts)**:
   - ✅ Maps quote results by line_id (line 233)
   - ✅ Uses per-line lookup for pricing (line 236)

---

## 📋 Manual Test Cases

### Test 1: Basic Duplicate Product (Same Config)
**Scenario**: Add same product twice with identical size/sugar

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=2
2. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=3
3. [ ] Verify quote shows 2 separate lines in table
4. [ ] Verify each line shows correct qty (2 and 3)
5. [ ] Verify each line shows correct line_total (qty × unit_price)
6. [ ] Verify grand total = sum of both lines

**Expected Result**: Both lines priced independently, no overwrite.

---

### Test 2: Duplicate Product (Different Configs)
**Scenario**: Same product with different size/sugar combinations

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=1
2. [ ] Add "Cà phê sữa đá" SIZE_LA, 70% đường, qty=2
3. [ ] Add "Cà phê sữa đá" STD, 50% đường, qty=1
4. [ ] Verify 3 separate lines in table
5. [ ] Verify each shows different size chip (Phê, La, STD)
6. [ ] Verify each shows different sugar chip
7. [ ] Verify each priced according to its size (different unit_price)
8. [ ] Verify totals correct for each line independently

**Expected Result**: Each line maintains its own config and pricing.

---

### Test 3: FREE_UPSIZE with Duplicate Products
**Scenario**: 5+ drinks with duplicates, verify upsize applies per-line

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=2 (Line A)
2. [ ] Add "Cà phê đen đá" SIZE_PHE, qty=2 (Line B)
3. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=2 (Line C - duplicate of A)
4. [ ] Total: 6 drinks → FREE_UPSIZE_5 should trigger
5. [ ] Verify ALL 3 lines auto-change from PHE → LA
6. [ ] Verify each line shows "• Upsize" badge independently
7. [ ] Verify quote shows each line.adjustments includes FREE_UPSIZE
8. [ ] Verify pricing: each charged at PHE, displayed as LA
9. [ ] Verify totals include all 3 lines with upsize savings

**Expected Result**: Free upsize applies to ALL SIZE_PHE lines independently, including duplicates.

---

### Test 4: DISCOUNT with Duplicate Products
**Scenario**: Apply 20% DRINK discount with duplicate products

1. [ ] Enter promotion code: "DISCOUNT20_DRINK"
2. [ ] Add "Trà đào" SIZE_PHE, qty=1 (Line A)
3. [ ] Add "Cà phê sữa đá" SIZE_LA, qty=2 (Line B)
4. [ ] Add "Trà đào" SIZE_PHE, qty=3 (Line C - duplicate of A)
5. [ ] Verify each line shows "• Discount" badge
6. [ ] Verify each line shows strike-through original price
7. [ ] Verify Line A: 1 × (unit_price × 0.8)
8. [ ] Verify Line C: 3 × (unit_price × 0.8) - same unit_price as A, different qty
9. [ ] Verify discount_total = sum of all line discounts

**Expected Result**: Discount applies to each line independently based on its qty.

---

### Test 5: Mixed Scenario (Upsize + Discount + Duplicates)
**Scenario**: Complex order with all rules active

1. [ ] Enter promotion: "DISCOUNT20_DRINK"
2. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=2 (Line A - DRINK)
3. [ ] Add "Bánh flan" STD, qty=1 (Line B - CAKE, no discount/upsize)
4. [ ] Add "Cà phê đen đá" SIZE_PHE, qty=2 (Line C - DRINK)
5. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=2 (Line D - duplicate of A)
6. [ ] Total: 6 drinks → FREE_UPSIZE_5 triggers

**Verify**:
- [ ] Lines A, C, D: auto-change PHE → LA (upsize)
- [ ] Line B: no upsize (not DRINK), no discount (not in scope if cake excluded)
- [ ] Lines A, C, D: show "• Upsize" and "• Discount" badges
- [ ] Line B: no badges
- [ ] Each DRINK line: charged at (PHE_price × 0.8), displayed as LA
- [ ] Line A and D: same unit_price_after (identical config)
- [ ] Totals: subtotal - upsize_savings - discount_amount = grand_total

**Expected Result**: All rules apply correctly to each line based on its category/config.

---

### Test 6: Inline Note with Duplicates
**Scenario**: Same product with different notes

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, note="Ít đá" (Line A)
2. [ ] Add "Cà phê sữa đá" SIZE_PHE, note="Nhiều đá" (Line B)
3. [ ] Add "Cà phê sữa đá" SIZE_PHE, note="" (Line C - no note)
4. [ ] Verify each line shows its own note in inline input
5. [ ] Edit Line A note to "Extra hot"
6. [ ] Verify Line B and C notes unchanged
7. [ ] Create order
8. [ ] Check payload: each line has correct note field

**Expected Result**: Notes are independent per line, not shared.

---

### Test 7: Edit Mode with Duplicates
**Scenario**: Edit one of multiple duplicate lines

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=2 (Line A)
2. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=3 (Line B)
3. [ ] Click Size chip on Line A
4. [ ] Modal opens in EDIT mode with Line A data
5. [ ] Change size to LA, sugar to 70%, qty to 5, note "test"
6. [ ] Click "Lưu"
7. [ ] Verify Line A updates: LA, 70%, qty=5, note="test"
8. [ ] Verify Line B unchanged: PHE, 100%, qty=3, no note
9. [ ] Verify quote recalculates correctly for both lines

**Expected Result**: Edit affects only target line, other lines unaffected.

---

### Test 8: Remove One of Duplicate Lines
**Scenario**: Delete one line shouldn't affect duplicate

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=2 (Line A)
2. [ ] Add "Cà phê sữa đá" SIZE_PHE, qty=3 (Line B)
3. [ ] Add "Trà đào" SIZE_LA, qty=1 (Line C)
4. [ ] Note Line A total = 2 × price_phe
5. [ ] Click × to remove Line A
6. [ ] Verify Line B still exists with qty=3
7. [ ] Verify Line C still exists
8. [ ] Verify quote recalculates: only Line B + C

**Expected Result**: Removing one duplicate doesn't affect other duplicates.

---

### Test 9: Order Creation with Duplicates
**Scenario**: Submit order with duplicate products

1. [ ] Add "Cà phê sữa đá" SIZE_PHE, 100% đường, qty=2, note="Hot"
2. [ ] Add "Cà phê sữa đá" SIZE_LA, 70% đường, qty=1, note="Cold"
3. [ ] Add customer info + shipping
4. [ ] Click "Tạo đơn"
5. [ ] Verify order created successfully
6. [ ] Check database order_lines:
   - [ ] 2 separate rows for same product_id
   - [ ] Row 1: price_key_snapshot="SIZE_PHE", qty=2, note="Hot"
   - [ ] Row 2: price_key_snapshot="SIZE_LA", qty=1, note="Cold"
   - [ ] Each has correct unit_price_snapshot and line_total

**Expected Result**: Order stores both lines independently with correct data.

---

## 🔍 Technical Verification

### Check Network Requests:

1. **Quote Request** (POST /api/quote):
```json
{
  "lines": [
    {
      "line_id": "uuid-1",
      "product_id": "same-product-uuid",
      "qty": 2,
      "price_key": "SIZE_PHE",
      "options": { "sugar": "SUGAR_100" }
    },
    {
      "line_id": "uuid-2",  // Different line_id
      "product_id": "same-product-uuid",  // Same product
      "qty": 3,
      "price_key": "SIZE_LA",
      "options": { "sugar": "SUGAR_70" }
    }
  ]
}
```

2. **Quote Response**:
```json
{
  "ok": true,
  "lines": [
    {
      "line_id": "uuid-1",  // Preserved
      "product_id": "same-product-uuid",
      "qty": 2,
      "unit_price_after": 45000,
      "line_total_after": 90000
    },
    {
      "line_id": "uuid-2",  // Preserved
      "product_id": "same-product-uuid",
      "qty": 3,
      "unit_price_after": 55000,
      "line_total_after": 165000
    }
  ],
  "totals": {
    "grand_total": 255000  // Correct sum
  }
}
```

3. **Order Request** (POST /api/orders):
```json
{
  "lines": [
    {
      "line_id": "uuid-1",
      "product_id": "same-product-uuid",
      "qty": 2,
      "display_size": "SIZE_PHE",
      "price_key": "SIZE_PHE",
      "note": "Hot"
    },
    {
      "line_id": "uuid-2",
      "product_id": "same-product-uuid",
      "qty": 3,
      "display_size": "SIZE_LA",
      "price_key": "SIZE_LA",
      "note": "Cold"
    }
  ]
}
```

---

## ✅ Success Criteria

All tests pass when:
- [ ] Quote request includes unique `line_id` for each line
- [ ] Quote response preserves `line_id` for each line
- [ ] Client maps quote by `line_id`, not `product_id`
- [ ] Duplicate products show as separate lines with independent pricing
- [ ] FREE_UPSIZE applies per-line based on each line's adjustments
- [ ] DISCOUNT applies per-line based on each line's qty
- [ ] Editing one duplicate line doesn't affect others
- [ ] Order creation stores duplicate lines as separate rows
- [ ] Grand totals always equal sum of all line_total_after values

---

## 🐛 Common Issues (If Tests Fail)

If you encounter issues:

1. **Total shows wrong amount**: Check if quoteLineMap uses product_id instead of line_id
2. **Upsize applies to wrong line**: Verify `quoteLineMap.get(l.id)` not `get(l.product_id)`
3. **Discount missing on duplicate**: Check discount calculation uses per-line ql
4. **Last duplicate overwrites earlier ones**: Verify Map key is line_id, not product_id

Current implementation should pass all tests as line_id mapping is already implemented correctly.
