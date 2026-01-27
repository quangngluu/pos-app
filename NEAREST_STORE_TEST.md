# Nearest Store Suggestion - Testing Checklist

## Setup

1. **Run SQL Migration**
   ```bash
   # Execute the SQL in Supabase SQL Editor or run migration
   cat supabase/migrations/20260117_nearest_store.sql
   ```

2. **Verify Database**
   - Check `public.stores` table has active stores with `lat`, `lng`, and `geom` populated
   - Test RPC function:
     ```sql
     SELECT * FROM nearest_store(10.776, 106.701, 5);
     ```
   - Should return stores ordered by distance with `distance_m` field

3. **Verify API Key**
   - Ensure `.env.local` has `GOOGLE_PLACE_API_KEY` set

## Test Scenarios

### ✅ Scenario 1: Auto-suggest nearest store after address selection

1. Open POS page: `http://localhost:3000/pos`
2. In "Địa chỉ giao hàng" field, type an address (e.g., "LIM TOWER 3")
3. Select an address from Google Places dropdown
4. **Expected Results:**
   - "Đang tìm cơ sở gần nhất..." loading message appears briefly
   - Store field auto-fills with nearest store name
   - Green hint text shows: "Gợi ý cơ sở gần nhất: <store_name> (~<distance>m)"
   - Store field remains editable

### ✅ Scenario 2: Manual override store selection

1. After auto-selection, click on "Cơ sở thực hiện" field
2. Dropdown shows list of 5 nearest stores with distances
3. Click different store from dropdown
4. **Expected Results:**
   - Selected store name fills the field
   - Green hint text disappears (manual override)
   - Store ID is updated internally

### ✅ Scenario 3: Store persists in order note

1. Complete order form with products, customer, address, store
2. Click "Tạo đơn hàng"
3. **Expected Results:**
   - Order created successfully
   - Order note includes: "- Cơ sở thực hiện: <store_name>"
   - Check Supabase `orders` table for note content

### ✅ Scenario 4: Change address triggers new store suggestion

1. Select initial address → store auto-fills
2. Manually change store selection
3. Select different address from dropdown
4. **Expected Results:**
   - New nearest stores fetched for new address
   - Store field updates to NEW nearest store
   - Green hint shows new suggestion
   - Previous manual override is reset

### ✅ Scenario 5: Error handling

1. Select address without lat/lng (edge case)
2. **Expected Results:**
   - Error message: "Không tìm được tọa độ địa chỉ"
   - Store field remains editable
   - No crash

### ✅ Scenario 6: No stores found

1. Mock `/api/stores/nearest` to return empty list
2. Select address
3. **Expected Results:**
   - Error message: "Không tìm được cơ sở gần nhất"
   - User can still type store name manually

### ✅ Scenario 7: Manual store search (optional)

1. Type store name in "Cơ sở thực hiện" field
2. Focus field to open dropdown
3. **Expected Results:**
   - If address selected, shows nearest stores
   - User can type custom store name if not in list

## API Testing

### Test `/api/stores/nearest`

```bash
# Test with valid coordinates (HCM city center)
curl "http://localhost:3000/api/stores/nearest?lat=10.776&lng=106.701&limit=5"

# Expected response:
# {
#   "ok": true,
#   "items": [
#     {
#       "id": "uuid",
#       "name": "Phê La ...",
#       "address_full": "...",
#       "distance_m": 123
#     }
#   ]
# }

# Test missing lat/lng
curl "http://localhost:3000/api/stores/nearest?limit=5"
# Expected: {"ok": false, "error": "MISSING_LAT_LNG: lat and lng query parameters are required"}
```

### Test `/api/stores` (search by name)

```bash
# Search all active stores
curl "http://localhost:3000/api/stores"

# Search by name
curl "http://localhost:3000/api/stores?q=Ph%C3%AA%20La"

# Expected response:
# {
#   "ok": true,
#   "items": [
#     {"id": "uuid", "name": "Phê La ...", "address_full": "..."}
#   ]
# }
```

## Debugging

### Check Network Tab

- **Address selection**: POST `/api/geoapify/autocomplete` → GET `/api/places/details`
- **After address selected**: GET `/api/stores/nearest?lat=...&lng=...&limit=5`
- Verify lat/lng values are correct

### Check Console Logs

- Look for: "Nearest stores fetch error" (if API fails)
- DEV mode: Check if address parsing logs show lat/lng

### Check Database

```sql
-- Verify active stores with geom
SELECT id, name, lat, lng, is_active, geom IS NOT NULL as has_geom
FROM public.stores
WHERE is_active = true;

-- Test RPC with specific coordinates
SELECT * FROM nearest_store(10.776, 106.701, 5);
```

## Known Limitations

1. **Geocoding not supported**: `/api/stores/nearest` requires explicit lat/lng from selected address, does not geocode text addresses
2. **Session scope**: Store suggestions cleared on page refresh
3. **Manual typing**: User can type any store name; validation not enforced
4. **Distance accuracy**: Calculated as straight-line distance, not driving distance

## Success Criteria

- ✅ Selecting delivery address → nearest store auto-fills
- ✅ User can override store selection
- ✅ Store info included in order note
- ✅ No breaking changes to existing order flow
- ✅ API returns deterministic list with distance_m
- ✅ Zero TypeScript errors
