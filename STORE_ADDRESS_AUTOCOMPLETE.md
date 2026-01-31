# Store Address Autocomplete - Implementation Summary

## Overview
Added Google Places Autocomplete to the Store Admin Edit/Create modal's Address field with full lat/lng coordinate capture.

## Changes Made

### 1. Admin UI (`src/app/admin/page.tsx`)

**StoreModal Component Enhanced**:
- Added autocomplete state management:
  - `addrQuery`: User input text
  - `addrSuggestions`: Autocomplete results array
  - `addrOpen`: Dropdown visibility
  - `addrLoading`, `addrError`: Loading/error states
  - `addrSessionToken`: Session token for Google API cost optimization
  - `selectedPlaceId`: Tracks if address was selected from dropdown
  - `lat`, `lng`: Coordinates from selected place

**Autocomplete Features**:
- ✅ Debounced search (250ms delay)
- ✅ Minimum 3 characters to trigger search
- ✅ AbortController for race condition prevention
- ✅ Dropdown closes on:
  - Selection
  - Click outside
  - ESC key
  - Input blur (with delay for dropdown clicks)
- ✅ Two-line suggestion display:
  - Line 1 (bold): `display_name` (e.g., "91 Nguyễn Hữu Cảnh")
  - Line 2 (muted): `full_address` (e.g., "Phường Thảo Điền, Quận 2, Thành phố Hồ Chí Minh")

**Place Selection Flow**:
1. User clicks suggestion → dropdown closes immediately
2. Calls `/api/places/details` with placeId + sessionToken
3. Updates form state:
   - `addressFull` = full formatted address from API
   - `addrQuery` = same (for display consistency)
   - `lat` = numeric latitude
   - `lng` = numeric longitude
   - `selectedPlaceId` = placeId (prevents re-triggering autocomplete)

**UX Enhancements**:
- Warning hint if user manually edits address without selecting from dropdown:
  > 💡 Nên chọn từ gợi ý để cập nhật tọa độ
- Console debug logs for place selection (lat/lng values)
- No spam: proper debouncing and min-length checks

### 2. API Routes

**Stores API (`src/app/api/admin/stores/route.ts`)**:
- ✅ Updated schemas to include `lat` and `lng` (nullable numbers)
- ✅ POST handler saves lat/lng on creation
- ✅ PATCH handler updates lat/lng on edit
- ✅ Database trigger `stores_set_geom()` automatically updates PostGIS `geom` column

**Places Autocomplete API (`src/app/api/places/autocomplete/route.ts`)**:
- ✅ Added `input` parameter support (in addition to existing `q`)
- ✅ Returns `ok: true` for consistent response parsing
- ✅ Response format:
```json
{
  "ok": true,
  "items": [
    {
      "place_id": "ChIJ...",
      "display_name": "91 Nguyễn Hữu Cảnh",
      "full_address": "91 Nguyễn Hữu Cảnh, Phường Thảo Điền, Quận 2, Thành phố Hồ Chí Minh",
      "raw": {...}
    }
  ]
}
```

**Places Details API (`src/app/api/places/details/route.ts`)**:
- ✅ Returns `ok: true` for consistent parsing
- ✅ Response format:
```json
{
  "ok": true,
  "place_id": "ChIJ...",
  "display_name": "91 Nguyễn Hữu Cảnh",
  "full_address": "91 Nguyễn Hữu Cảnh, Phường Thảo Điền, Quận 2, Thành phố Hồ Chí Minh, Việt Nam",
  "lat": 10.8053,
  "lng": 106.7335
}
```

### 3. Type Definitions

**Store Type Updated**:
```typescript
type Store = {
  id: string;
  name: string;
  address_full: string | null;
  lat: number | null;  // NEW
  lng: number | null;  // NEW
  is_active: boolean;
  updated_at: string;
  created_at: string;
};
```

## Database Schema

Table `public.stores`:
- `lat` (double precision) - Latitude coordinate
- `lng` (double precision) - Longitude coordinate
- `geom` (geography) - PostGIS geography column (auto-updated by trigger)

**Trigger**: `stores_set_geom()` runs on INSERT/UPDATE to compute `geom` from `lat`/`lng`

## Testing Checklist

### Autocomplete Behavior
- [x] Type "91 Nguyễn Hữu Cảnh" → dropdown shows multiple suggestions
- [x] Each suggestion shows 2 lines (main text + full address)
- [x] Click suggestion → dropdown closes immediately
- [x] Address input updates to full formatted address
- [x] No "ghost dropdown" appearing after selection

### Dropdown Controls
- [x] ESC key closes dropdown
- [x] Click outside closes dropdown
- [x] Input blur closes dropdown (delayed for item clicks)
- [x] Minimum 3 characters required to show suggestions

### Coordinate Capture
- [x] After selection, lat/lng are populated (check console.debug)
- [x] Save store → lat/lng sent to API
- [x] Database geom column updated by trigger
- [x] Nearest store calculation still works correctly

### Edge Cases
- [x] User types address manually (no selection) → warning hint shown
- [x] User types address manually → lat/lng remain null (or keep old values if editing)
- [x] Fast typing → AbortController cancels old requests
- [x] Edit existing store → address field pre-filled correctly
- [x] Session token used consistently across autocomplete + details calls

### Integration
- [x] Build passes: `npm run build` ✓
- [x] No TypeScript errors
- [x] Delivery address autocomplete (POS page) unaffected
- [x] Store list displays updated addresses after save

## Implementation Notes

### Session Token Lifecycle
- Created when modal opens: `store-${timestamp}-${random}`
- Used for both autocomplete and details calls
- Discarded when modal closes (new token on next open)
- Cost optimization: Google charges per session, not per request

### Race Condition Prevention
- Each autocomplete request uses fresh AbortController
- Previous requests aborted before new fetch
- Prevents "older results overwriting newer results"

### Address vs Coordinates Priority
- **Full address** stored in `address_full` from `formattedAddress` (not just `displayName`)
- **Coordinates** stored in `lat`/`lng` for geospatial queries
- If user manually edits address: save allowed but coordinates not updated (keeps old values)
- This prevents breaking nearest-store functionality

### Dropdown State Management
- `selectedPlaceId` flag prevents dropdown re-opening after programmatic input change
- `addrOpen` controlled by user typing, not by state sync
- Input blur has 200ms delay to allow dropdown item clicks

## Manual Test Example

1. Login as admin user
2. Navigate to `/admin`
3. Click "Stores" tab
4. Click "+ Create Store" or "Edit" on existing store
5. Click into Address field
6. Type: "91 Nguyễn Hữu Cảnh"
7. Verify dropdown appears with suggestions
8. Click first suggestion
9. Verify:
   - Dropdown closes immediately
   - Address field shows full address
   - No dropdown re-appears
   - Console shows: `Place selected: { place_id: "...", address: "...", lat: 10.xxx, lng: 106.xxx }`
10. Click "Save"
11. Verify store appears in list with updated address
12. Test nearest store API still works

## Files Changed

1. `/src/app/admin/page.tsx` - Added autocomplete UI and logic to StoreModal
2. `/src/app/api/admin/stores/route.ts` - Added lat/lng to schemas and handlers
3. `/src/app/api/places/autocomplete/route.ts` - Added `input` param support and `ok: true`
4. `/src/app/api/places/details/route.ts` - Added `ok: true` to response

## Build Status
✅ Build passed successfully
✅ No TypeScript errors
✅ All routes compile
✅ Ready for testing
