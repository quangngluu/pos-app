# Address Autocomplete Fix - Implementation Summary

## ✅ COMPLETED - January 31, 2026

### Objective
Fix Google Places API integration to show proper 2-line suggestions, use full formatted addresses, and ensure correct numeric coordinates for nearest-store lookups.

---

## Changes Made

### 1. **New Helper Library** - `src/app/lib/addressHelpers.ts`
Created shared utilities for coordinate handling:
- `parseCoord(x)`: Safely parse coordinates from number/string (handles comma/dot decimals)
- `extractCoords(addr)`: Extract numeric lat/lng from various address object structures

### 2. **Autocomplete Route** - `src/app/api/places/autocomplete/route.ts`
**Changes:**
- ✅ Added `X-Goog-FieldMask` header with minimal fields for cost optimization:
  - `suggestions.placePrediction.placeId`
  - `suggestions.placePrediction.structuredFormat.mainText`
  - `suggestions.placePrediction.structuredFormat.secondaryText`
  - `suggestions.placePrediction.text`
- ✅ Updated response format to include:
  ```typescript
  {
    place_id: string,
    main_text: string,        // Street address (bold in UI)
    secondary_text: string,   // Ward/district/city (smaller/grey in UI)
    display_name: string,     // Fallback
    full_address: string      // Complete formatted address
  }
  ```
- ✅ Added `Cache-Control: private, max-age=30` header

### 3. **Place Details Route** - `src/app/api/places/details/route.ts`
**Changes:**
- ✅ Kept minimal field mask: `id,displayName,formattedAddress,location,addressComponents`
- ✅ In-memory cache by placeId with 10-minute TTL (reduces API calls)
- ✅ Session token support for billing consolidation
- ✅ Improved VN address component mapping:
  - **Ward**: `administrative_area_level_3` → `sublocality_level_2` → `sublocality_level_3` → prefix match
  - **District**: `sublocality_level_1` → `administrative_area_level_2`
  - **City**: `locality` (priority) → `administrative_area_level_2` → `administrative_area_level_1` (fallback)
  - **Line1**: `street_number + route` with fallbacks
- ✅ Response format:
  ```typescript
  {
    ok: true,
    place_id: string,
    display_name: string,
    full_address: string,     // Full formatted address
    lat: number | null,
    lng: number | null,
    lon: number | null,       // Alias for backward compatibility
    address: {
      line1, ward, district, city, state, postcode, country, country_code
    },
    raw: object              // Only in development
  }
  ```
- ✅ Raw data excluded in production (reduces payload size)

### 4. **POS Page** - `src/app/pos/page.tsx`
**Changes:**
- ✅ Import `extractCoords` helper
- ✅ Updated address dropdown to show **2-line format**:
  ```tsx
  <div style={{ fontWeight: 600 }}>{main_text}</div>
  {secondary_text && (
    <div style={{ fontSize: 12, color: "#6b7280" }}>{secondary_text}</div>
  )}
  ```
- ✅ On suggestion selection:
  - Clears suggestions immediately (prevents reopening)
  - Fetches place details
  - Sets `addrQuery = json.full_address` (NOT just display_name)
  - Sets `selectedAddr = json` (includes lat/lng/address components)
  - Resets session token
- ✅ Updated nearest-store effect:
  - Uses `extractCoords(selectedAddr)` helper
  - Validates `Number.isFinite(lat) && Number.isFinite(lng)` before API call
  - Prevents bad coordinates (0, NaN, strings) from breaking nearest-store lookup

### 5. **Orders Route** - `src/app/api/orders/route.ts`
**Changes:**
- ✅ Added `parseCoord()` helper (handles string coordinates with comma/dot)
- ✅ Updated `parseAddressFromSelected()`:
  - Accepts both `lng` and `lon` (backward compatibility)
  - Extracts all address components: `line1`, `ward`, `district`, `city`, `state`, `postcode`, `country`, `country_code`
- ✅ Order creation now persists:
  - `delivery_lat`, `delivery_lng`, `delivery_place_id`
  - `delivery_addr_line1`, `delivery_ward`, `delivery_district`
  - `delivery_city`, `delivery_state`, `delivery_postcode`, `delivery_country`
  - `delivery_display_name` (full formatted address)

---

## Cost Optimization Features

### ✅ Minimal Field Masks
- Autocomplete: Only fetches placeId + structured text fields
- Details: Only fetches id, displayName, formattedAddress, location, addressComponents

### ✅ Session Token Flow
1. Client generates token on first autocomplete request
2. Token passed to both autocomplete + details
3. Token reset after successful selection
4. Google bills entire session as single request

### ✅ In-Memory Cache
- Place details cached by placeId for 10 minutes
- Cache size limited to 100 entries (FIFO eviction)
- Prevents duplicate API calls for same location

### ✅ Short Cache-Control
- Autocomplete: `max-age=30` (safe for rapidly changing data)
- Details: `max-age=600` (10 minutes, matches in-memory cache)

---

## Testing Checklist

### ✅ Dropdown Display
- [ ] Type "123 Nguyen Hue" in HCM
- [ ] Verify dropdown shows:
  - **Bold line**: Street address (main_text)
  - **Grey line**: Ward, District, City (secondary_text)
- [ ] Verify single-line addresses show properly (no secondary_text)

### ✅ Selection Behavior
- [ ] Click a suggestion
- [ ] Verify dropdown closes immediately
- [ ] Verify dropdown does NOT reopen after selection
- [ ] Verify input shows **full formatted address** (not just street)
- [ ] Example: "123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Hồ Chí Minh"

### ✅ Nearest Store
- [ ] Select an address in District 1, HCM
- [ ] Verify nearest store suggestion shows correct store name
- [ ] Verify distance is NOT "0m" (unless truly same location)
- [ ] Verify distance is reasonable (e.g., 2.5km, not 2500km)

### ✅ Order Creation
- [ ] Create order with selected address
- [ ] Verify order includes:
  - `delivery_lat` / `delivery_lng` (numeric)
  - `delivery_place_id` (Google Place ID)
  - `delivery_display_name` (full formatted address)
  - Address components (line1, ward, district, city)

### ✅ Cost Verification (Dev Tools Network Tab)
- [ ] Check autocomplete request has minimal FieldMask
- [ ] Check details request has minimal FieldMask
- [ ] Check details request includes `X-Goog-Session-Token` header
- [ ] Verify same address selected twice uses cache (2nd response instant)

---

## Key Fixes

### 🐛 Fixed: Dropdown shows single line
**Before:** Only displayed `display_name` (street address only)  
**After:** Shows `main_text` (bold) + `secondary_text` (grey, smaller)

### 🐛 Fixed: Input shows partial address
**Before:** Set `addrQuery = json.display_name` (street only)  
**After:** Set `addrQuery = json.full_address` (complete formatted address)

### 🐛 Fixed: Nearest store returns wrong store/0m
**Before:** Used string coords or undefined → API received NaN/0  
**After:** Use `extractCoords()` + validate `Number.isFinite()` before API call

### 🐛 Fixed: Address components not persisted
**Before:** Only stored `delivery_lat`, `delivery_lng`, `delivery_place_id`  
**After:** Store all address components (line1, ward, district, city, etc.)

### 🐛 Fixed: Dropdown reopens after selection
**Before:** Setting `addrQuery` triggered autocomplete effect  
**After:** Set `suppressAddrSearchRef.current = true` before updating query

---

## Files Modified

1. ✅ `src/app/lib/addressHelpers.ts` - **NEW**
2. ✅ `src/app/api/places/autocomplete/route.ts`
3. ✅ `src/app/api/places/details/route.ts`
4. ✅ `src/app/pos/page.tsx`
5. ✅ `src/app/api/orders/route.ts`

---

## Build Status
✅ `npm run build` - **PASSED**

All TypeScript compiled successfully, no errors.

---

## Next Steps (Manual Testing)

1. **Start dev server**: `npm run dev`
2. **Navigate to POS**: http://localhost:3000/pos
3. **Test address autocomplete**:
   - Type: "123 Nguyen Hue"
   - Verify 2-line dropdown
   - Select suggestion
   - Verify full address in input
   - Verify nearest store suggestion shows correct store with distance
4. **Create test order**:
   - Verify order persists all address fields
   - Check database for delivery_ward, delivery_district, delivery_city

---

## Database Schema Notes

The orders table should have these columns for full address support:
- `delivery_display_name` (TEXT) - Full formatted address
- `delivery_place_id` (TEXT) - Google Place ID
- `delivery_lat` (NUMERIC) - Latitude
- `delivery_lng` (NUMERIC) - Longitude
- `delivery_addr_line1` (TEXT) - Street address
- `delivery_ward` (TEXT) - Phường/Xã
- `delivery_district` (TEXT) - Quận/Huyện
- `delivery_city` (TEXT) - Thành phố
- `delivery_state` (TEXT) - Tỉnh (if applicable)
- `delivery_postcode` (TEXT) - Postal code
- `delivery_country` (TEXT) - Country name

If any columns are missing, create a migration to add them.
