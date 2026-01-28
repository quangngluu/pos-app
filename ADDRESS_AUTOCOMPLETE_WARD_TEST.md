# Address Autocomplete with Ward/District - Test Guide

## Overview
Testing improved address autocomplete with full formatted addresses including ward (phường), district (quận), and city (thành phố).

## Changes Made

### 1. Autocomplete API Route
**File**: `src/app/api/places/autocomplete/route.ts`
- Returns `main_text` (street address) and `secondary_text` (ward/district/city)
- Deduplicates suggestions by `place_id`
- Language: Vietnamese (`languageCode: "vi"`, `regionCode: "VN"`)

### 2. Place Details API Route
**File**: `src/app/api/places/details/route.ts`
- FieldMask includes `addressComponents` for parsing ward/district/city
- Returns `address_full` (formatted address with all components)
- Parses Vietnamese address components:
  - **Ward** (phường): `sublocality_level_2`, `sublocality_level_3`, `administrative_area_level_3`, `neighborhood`
  - **District** (quận): `sublocality_level_1`, `administrative_area_level_2`
  - **City** (thành phố): `locality`, `administrative_area_level_1`
- In-memory cache: 10 minutes TTL, 100 entries max

### 3. POS Page UI
**File**: `src/app/pos/page.tsx`
- **2-line suggestions**: Street address (bold) + ward/district/city (smaller, lighter)
- **Input displays full address** after selection (uses `address_full` from details)
- **Session token lifecycle**:
  - Generated on input focus
  - Used for all autocomplete + details calls
  - Reset after selection
- **Numeric lat/lng safety**: Ensures coordinates are numbers before calling nearest-store

---

## Test Cases

### Test Case 1: Full Address Display

**Steps:**
1. Navigate to `/pos` page
2. Click "Địa chỉ giao" input
3. Type: `91 Nguyễn Hữu Cảnh`
4. Wait for dropdown (~250ms debounce)

**Expected Results:**
✅ Suggestions appear in 2 lines:
- **Line 1** (bold): "91 Nguyễn Hữu Cảnh" or street name
- **Line 2** (smaller): "Phường Thảo Điền, Thành phố Thủ Đức, Hồ Chí Minh" (or similar)

✅ Console logs:
```
[POS] Address input focused: generated session token <UUID>
[POS] Autocomplete: fetching { query: "91 Nguyễn Hữu Cảnh", sessionToken: "<UUID>" }
[Autocomplete] Query: "91 Nguyễn Hữu Cảnh", sessionToken: present
[Autocomplete] Returning X suggestions (deduplicated)
[POS] Autocomplete: received suggestions X
```

---

### Test Case 2: Full Address After Selection

**Steps:**
1. Continue from Test Case 1
2. Click the first suggestion

**Expected Results:**
✅ Input shows FULL formatted address including ward/district/city, e.g.:
```
91 Nguyễn Hữu Cảnh, Phường Thảo Điền, Thành phố Thủ Đức, Hồ Chí Minh, Việt Nam
```

✅ NOT just short form like: "91 Nguyễn Hữu Cảnh"

✅ Console logs:
```
[POS] Address selected: { place_id: "...", main_text: "91 Nguyễn Hữu Cảnh", secondary_text: "Phường..." }
[POS] Fetching place details: { url: "...", sessionToken: "<UUID>" }
[POS] Place details received: { place_id, address_full, lat, lng, ward, district, city }
[POS] Resetting session token after selection
[POS] Nearest store: selectedAddr changed { lat: X, lng: Y, selectedAddr: {...} }
```

---

### Test Case 3: No Duplicate Suggestions

**Steps:**
1. Type: `123 Lê Lợi`
2. Observe dropdown suggestions

**Expected Results:**
✅ Each `place_id` appears only once (no duplicates)
✅ Console shows: `[Autocomplete] Returning X suggestions (deduplicated)`

---

### Test Case 4: Nearest Store Works

**Steps:**
1. Continue from Test Case 2 (address selected)
2. Scroll to "Nearest Store" section

**Expected Results:**
✅ Nearest store appears with distance (e.g., "~500m")
✅ Distance is NOT "~0m"
✅ Console shows API call: `/api/stores/nearest?lat=X&lng=Y`
✅ `lat` and `lng` are valid numbers

---

### Test Case 5: Session Token Lifecycle

**Steps:**
1. Click address input → Type "abc"
2. Note session token UUID in console
3. Click a suggestion → Observe details call
4. Type "xyz" in address input → Wait for suggestions
5. Note NEW session token UUID

**Expected Results:**
✅ Step 2: Token generated on focus
✅ Step 3: Details call uses SAME token, then reset to `""`
✅ Step 5: NEW token generated (different UUID)
✅ Google billing: Single session charge per autocomplete → selection → details sequence

---

### Test Case 6: Place Details Cache

**Steps:**
1. Select address "91 Nguyễn Hữu Cảnh, Phường Thảo Điền..."
2. Clear input, type same address again
3. Select same suggestion again

**Expected Results:**
✅ First selection: Response header `X-Cache: MISS`
✅ Second selection (within 10 min): Response header `X-Cache: HIT`
✅ No duplicate API call to Google Places Details

---

### Test Case 7: Vietnamese Language

**Steps:**
1. Type: `Bitexco`
2. Observe suggestions

**Expected Results:**
✅ Suggestions show Vietnamese text: "Phường", "Quận", "Thành phố"
✅ NOT English: "Ward", "District", "City"
✅ Console shows autocomplete request includes `languageCode: "vi"`

---

### Test Case 8: Address Components Parsing

**Steps:**
1. Select any address
2. Check console log: `[POS] Place details received: { ... }`

**Expected Results:**
✅ Response includes:
```json
{
  "place_id": "...",
  "address_full": "Full formatted address with ward/district/city",
  "display_name": "Short name",
  "lat": 10.xxx,
  "lng": 106.xxx,
  "ward": "Phường Thảo Điền",
  "district": "Thành phố Thủ Đức",
  "city": "Hồ Chí Minh"
}
```

---

### Test Case 9: Cost Optimization

**Verification:**
- ✅ Autocomplete uses session token (see request body)
- ✅ Details uses SAME session token (see URL query param)
- ✅ Debounce: Only 1 autocomplete call per ~250ms typing pause
- ✅ Details called ONLY on selection (not on every keystroke)
- ✅ FieldMask minimal: `id,displayName,formattedAddress,location,addressComponents`
- ✅ Cache: Repeated details calls return cached data (X-Cache: HIT)

---

### Test Case 10: Order Creation

**Steps:**
1. Select address with full formatted address
2. Add products to order
3. Fill customer phone
4. Click "Create order"

**Expected Results:**
✅ Order created successfully
✅ Database `orders` table includes:
- `address`: Full formatted address
- `delivery_display_name`: Full formatted address
- `delivery_lat`: Numeric latitude
- `delivery_lng`: Numeric longitude
- `delivery_place_id`: Google Place ID

---

## Visual Verification

### Before Fix:
```
Dropdown:
  • 91 Nguyễn Hữu Cảnh
  • 91 Nguyễn Hữu Cảnh  (duplicate!)

After selection:
  Input: "91 Nguyễn Hữu Cảnh"  ❌ Too short
```

### After Fix:
```
Dropdown:
  • 91 Nguyễn Hữu Cảnh
    Phường Thảo Điền, Thành phố Thủ Đức, Hồ Chí Minh

After selection:
  Input: "91 Nguyễn Hữu Cảnh, Phường Thảo Điền, Thành phố Thủ Đức, Hồ Chí Minh, Việt Nam"  ✅ Full address
```

---

## Performance Checks

1. **API Call Count** (for typing "123 abc xyz"):
   - Autocomplete: ~3 calls (after debounce)
   - Details: 1 call (only on selection)

2. **Cache Hit Rate**:
   - First selection: MISS (fetch from Google)
   - Repeat selection: HIT (serve from cache)
   - Cache TTL: 10 minutes

3. **Response Times**:
   - Autocomplete: < 500ms
   - Details (cache miss): < 1000ms
   - Details (cache hit): < 50ms

---

## Debugging Tips

### Enable Debug Logs:
Open browser console and filter by:
- `[POS]` - Client-side POS page logs
- `[Autocomplete]` - Server-side autocomplete logs
- `[Place details]` - Server-side details logs (if added)

### Check Network Tab:
1. Filter by `/api/places/`
2. Verify:
   - Autocomplete: GET with `?q=...&sessionToken=...`
   - Details: GET with `?placeId=...&sessionToken=...`
   - Response headers: `X-Cache: HIT/MISS`

### Common Issues:

**Issue**: Suggestions still show duplicates
- **Fix**: Clear browser cache, rebuild: `npm run build`

**Issue**: No ward in suggestions
- **Check**: Autocomplete response `secondary_text` field
- **Verify**: Google API request includes `languageCode: "vi"`

**Issue**: Input shows short address after selection
- **Check**: Selection handler uses `address_full` not `display_name`
- **Verify**: Details response includes `formattedAddress`

**Issue**: Nearest store not working
- **Check**: Console for lat/lng values
- **Verify**: `Number.isFinite(lat)` and `Number.isFinite(lng)` are true

---

## Success Criteria

All test cases pass with:
- ✅ Autocomplete shows 2-line suggestions with ward/district
- ✅ Input displays full formatted address after selection
- ✅ No duplicate suggestions
- ✅ Session token properly managed (generate → use → reset)
- ✅ Place details cached (10 min TTL)
- ✅ Nearest store works with numeric coordinates
- ✅ Vietnamese language in all responses
- ✅ Address components parsed (ward/district/city)
- ✅ Order creation persists full address
- ✅ No TypeScript errors (`npm run build` passes)
