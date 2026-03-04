# Address Autocomplete - Manual Test Plan

## Overview
Testing end-to-end address search flow using Google Places API (New) with session tokens for cost optimization.

## Test Environment
- Browser: Chrome/Safari with DevTools Console open
- URL: http://localhost:3000/pos
- Console filter: `[POS]` or `[Autocomplete]` to see debug logs

## Pre-requisites
- Valid GOOGLE_PLACE_API_KEY in .env.local
- Dev server running: `npm run dev`
- Browser console open to monitor debug logs

---

## Test Case 1: Basic Autocomplete Flow

### Steps:
1. Navigate to /pos page
2. Click into "Delivery address" input field
3. Type "125 Hai Bà Trưng"
4. Wait ~250ms for debounce

### Expected Results:
- ✅ Console shows: `[POS] Autocomplete: generated new session token <UUID>`
- ✅ Console shows: `[POS] Autocomplete: fetching { query: "125 Hai Bà Trưng", sessionToken: "<UUID>" }`
- ✅ Console shows: `[Autocomplete] Query: "125 Hai Bà Trưng", sessionToken: present`
- ✅ Console shows: `[Autocomplete] Returning X suggestions`
- ✅ Console shows: `[POS] Autocomplete: received suggestions X`
- ✅ Dropdown appears with 1-6 suggestions
- ✅ Each suggestion shows address text

---

## Test Case 2: Address Selection

### Steps:
1. Continue from Test Case 1 (with suggestions visible)
2. Click on first suggestion in dropdown

### Expected Results:
- ✅ Console shows: `[POS] Address selected: { place_id: "...", display_name: "..." }`
- ✅ Console shows: `[POS] Fetching place details: { url: "...", sessionToken: "<UUID>" }`
- ✅ Dropdown immediately closes (suggestions cleared)
- ✅ Input field shows selected address display name
- ✅ Console shows: `[POS] Place details received: { place_id, display_name, full_address, lat, lng }`
- ✅ Console shows: `[POS] Resetting session token after selection`
- ✅ Console shows: `[POS] Nearest store: selectedAddr changed { lat: X, lng: Y, selectedAddr: {...} }`

---

## Test Case 3: Dropdown Does NOT Reappear

### Steps:
1. Continue from Test Case 2 (address selected)
2. Observe the input field and dropdown area
3. Wait 1-2 seconds

### Expected Results:
- ✅ Console shows: `[POS] Autocomplete: suppressed after selection`
- ✅ Dropdown does NOT reappear
- ✅ Input stays populated with selected address
- ✅ No additional autocomplete API calls

---

## Test Case 4: Nearest Store Integration

### Steps:
1. Continue from Test Case 2 (address selected with lat/lng)
2. Scroll down to "Nearest Store" section

### Expected Results:
- ✅ Console shows API call to `/api/stores/nearest?lat=X&lng=Y`
- ✅ "Nearest Store" section shows:
  - Store name
  - Distance (e.g., "~500m" or "~2.5km")
  - "✓" checkmark if within range
- ✅ Distance is NOT "~0m" (bug from previous implementation)

---

## Test Case 5: Order Creation with Address

### Steps:
1. Continue from Test Case 4 (with nearest store shown)
2. Add at least one product to order
3. Fill in customer phone: "0901234567"
4. Select platform (e.g., "Shopee Food")
5. Click "Create order" button

### Expected Results:
- ✅ Order created successfully
- ✅ In database `orders` table, check new order has:
  - `address` = full_address from selectedAddr
  - `delivery_display_name` = display_name from selectedAddr
  - `delivery_lat` = lat from selectedAddr
  - `delivery_lng` = lng from selectedAddr
  - `delivery_place_id` = place_id from selectedAddr
- ✅ Note field includes delivery address (if configured)

---

## Test Case 6: Session Token Lifecycle

### Steps:
1. Type "123 Nguyen" → wait for suggestions
2. Note the session token UUID in console
3. Click a suggestion → observe details call
4. Type "456 Le" → wait for suggestions
5. Note the NEW session token UUID

### Expected Results:
- ✅ Step 2: Session token generated (UUID1)
- ✅ Step 3: Details call uses same UUID1, then token reset to ""
- ✅ Step 5: New session token generated (UUID2 ≠ UUID1)
- ✅ Google billing: Autocomplete + Details with same token = single session charge

---

## Test Case 7: Stale Request Handling

### Steps:
1. Type "abc" quickly
2. Before debounce fires, type "xyz"
3. Wait for autocomplete

### Expected Results:
- ✅ Only ONE autocomplete request sent (for "abcxyz")
- ✅ Previous "abc" request aborted via AbortController
- ✅ No "stale" suggestions appear

---

## Test Case 8: Empty/Short Query

### Steps:
1. Clear address input (empty string)
2. Observe dropdown
3. Type "ab" (2 chars)
4. Observe dropdown

### Expected Results:
- ✅ Step 2: No autocomplete call, suggestions cleared
- ✅ Step 4: No autocomplete call (< 3 chars minimum)

---

## Test Case 9: API Error Handling

### Steps:
1. Temporarily comment out `GOOGLE_PLACE_API_KEY` in .env.local
2. Restart dev server
3. Type "125 Hai Bà Trưng"

### Expected Results:
- ✅ Console shows: `[Autocomplete] Missing GOOGLE_PLACE_API_KEY`
- ✅ Response status: 500
- ✅ No suggestions appear
- ✅ Console shows: `[POS] Autocomplete: error ...`

---

## Test Case 10: No Results

### Steps:
1. Type "xyznonexistentaddress123"
2. Wait for debounce

### Expected Results:
- ✅ Console shows: `[Autocomplete] No results found`
- ✅ Console shows: `[POS] Autocomplete: no suggestions`
- ✅ Empty dropdown or "No results" message

---

## Performance Checks

### Google API Cost Optimization:
- ✅ Autocomplete uses session token
- ✅ Details call uses SAME session token
- ✅ Token reset after selection (new session for next search)
- ✅ FieldMask in details: `id,displayName,formattedAddress,location` (minimal)
- ✅ Cache hit on repeated details call (10min TTL)

### Console Logs (Debug Mode):
All debug logs include `[POS]` or `[Autocomplete]` prefix for easy filtering.

---

## Regression Checks

### Ensure OLD Geoapify endpoint is NOT called:
- ✅ No requests to `/api/geoapify/autocomplete`
- ✅ All autocomplete requests go to `/api/places/autocomplete`

### Ensure address persistence works:
- ✅ Orders table has delivery_lat/lng/place_id columns
- ✅ Values are populated from selectedAddr

---

## Cleanup After Testing

1. Restore `GOOGLE_PLACE_API_KEY` in .env.local if temporarily removed
2. Check console for any uncaught errors
3. Verify no memory leaks (check browser DevTools Memory tab)

---

## Success Criteria

All test cases pass with:
- ✅ Autocomplete suggestions appear within 1 second
- ✅ Dropdown closes immediately on selection
- ✅ No dropdown reappear after selection
- ✅ Place details fetched with lat/lng
- ✅ Nearest store calculation works
- ✅ Order creation includes address fields
- ✅ Session token lifecycle correct
- ✅ Debug logs clear and traceable
- ✅ No Google API errors (status 200)
