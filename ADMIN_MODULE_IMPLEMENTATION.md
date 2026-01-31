# Admin Module Implementation

## Overview
Built Admin-lite UI for internal management of master data (Stores, Promotions, Products).

## Environment Configuration
Add to `.env.local`:
```
INTERNAL_EMAIL_DOMAIN=yourcompany.com
```
This restricts admin access to emails ending with `@yourcompany.com`. If not set, any authenticated user can access admin.

## Security Implementation
- **Authentication**: All `/admin` routes and `/api/admin/*` routes require authenticated Supabase user
- **Authorization**: Email domain check using `INTERNAL_EMAIL_DOMAIN` env variable
- **Protection**: Implemented in middleware (`src/lib/supabase/proxy.ts`) and API route guards (`requireUser()`)
- **No Client Writes**: All DB writes use `supabaseAdmin` (service role) server-side only

## Files Created

### API Routes
1. **`/src/app/api/admin/stores/route.ts`**
   - GET: List stores with optional search (`?q=`)
   - POST: Create new store
   - PATCH: Update existing store
   - Sets `updated_at` on updates
   - Validation: name required, address optional

2. **`/src/app/api/admin/promotions/route.ts`**
   - GET: List promotions with optional search (`?q=`)
   - POST: Create new promotion
   - PATCH: Update existing promotion (code is locked, cannot be changed)
   - Validation: code/name/promo_type required, percent_off 0-100, min_qty >= 0

3. **`/src/app/api/admin/products/route.ts`**
   - GET: List products with prices joined from product_prices table
   - POST: Create product + upsert prices (STD, SIZE_PHE, SIZE_LA)
   - PATCH: Update product fields + upsert prices
   - **No Delete Logic**: Blank prices are ignored (not deleted), only numeric values are upserted
   - Response includes prices: `{ id, code, name, category, is_active, prices: { STD?, SIZE_PHE?, SIZE_LA? } }`

### UI Page
4. **`/src/app/admin/page.tsx`**
   - Client component with three tabs: Stores, Promotions, Products
   - Each tab has:
     - Search input
     - Create button
     - Table view with data
     - Edit buttons (no delete buttons)
     - Modal for create/edit operations
   - Error banner for inline error display
   - Inline styling matching POS theme (dark mode)

### Middleware Update
5. **`/src/lib/supabase/proxy.ts`**
   - Added `/admin` to protected routes (`isAdminRoute`)
   - Redirects to login if not authenticated

## Data Model

### Stores
```typescript
{
  id: string (uuid)
  name: string (required)
  address_full: string | null
  is_active: boolean (default: true)
  lat, lng, geom: (read-only in v1)
  updated_at, created_at: timestamps
}
```

### Promotions
```typescript
{
  code: string (PK, required, locked in edit)
  name: string (required)
  promo_type: string (required)
  priority: number (default: 0)
  is_stackable: boolean (default: false)
  is_active: boolean (default: true)
  start_at: string | null
  end_at: string | null
  percent_off: number | null (0-100)
  min_qty: number | null (>= 0)
}
```

### Products
```typescript
{
  id: string (uuid)
  code: string (unique, required)
  name: string (required)
  category: string | null
  is_active: boolean (default: true)
  created_at: timestamp
  
  // Prices from product_prices table
  prices: {
    STD?: number
    SIZE_PHE?: number
    SIZE_LA?: number
  }
}
```

## Price Handling (Important)
- **UPSERT Only**: Only numeric price values are upserted
- **No Delete**: Blank/null price inputs are ignored (existing rows remain)
- **Rationale**: product_prices has no `is_active` and `price_vat_incl` is NOT NULL
- **Manual Cleanup**: If price needs removal, do manually in Supabase dashboard

## Manual Testing Checklist

### Authentication & Authorization
- [ ] `/admin` redirects to login when not authenticated
- [ ] `/admin` accessible after login with internal email domain
- [ ] `/admin` blocked for external email domains (403)
- [ ] `/api/admin/*` returns 401 when not authenticated
- [ ] `/api/admin/*` returns 403 for non-internal email domains

### Stores Module
- [ ] Search stores by name/address works
- [ ] Create store with name only
- [ ] Create store with name + address
- [ ] Edit store name
- [ ] Toggle store is_active checkbox
- [ ] Store list updates after save
- [ ] No delete button exists

### Promotions Module
- [ ] Search promotions by code/name works
- [ ] Create promotion with required fields (code, name, promo_type)
- [ ] Create promotion with all fields (percent_off, min_qty, dates, etc.)
- [ ] Edit promotion (code field is disabled/locked)
- [ ] Toggle promotion is_active checkbox
- [ ] Promotion list updates after save
- [ ] No delete button exists

### Products Module
- [ ] Search products by name/code works
- [ ] Create product with code + name only
- [ ] Create product with prices (STD, PHE, LA)
- [ ] Edit product name/category
- [ ] Update product prices (existing prices show in modal)
- [ ] Leave price blank (existing price should remain unchanged)
- [ ] Price columns display in table (STD, PHE, LA)
- [ ] Toggle product is_active checkbox
- [ ] Product list updates after save
- [ ] No delete button exists

### Build & Deploy
- [ ] `npm run build` passes without errors
- [ ] No TypeScript errors
- [ ] All API routes compile successfully
- [ ] Admin page compiles successfully

## Build Status
✅ Build passed successfully
✅ All routes compile without errors
✅ TypeScript validation passed

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stores?q=` | List stores with optional search |
| POST | `/api/admin/stores` | Create new store |
| PATCH | `/api/admin/stores` | Update store by id |
| GET | `/api/admin/promotions?q=` | List promotions with optional search |
| POST | `/api/admin/promotions` | Create new promotion |
| PATCH | `/api/admin/promotions` | Update promotion by code |
| GET | `/api/admin/products?q=&category=&active=` | List products with prices |
| POST | `/api/admin/products` | Create product + upsert prices |
| PATCH | `/api/admin/products` | Update product + upsert prices |

## Next Steps
1. Test with real authenticated user
2. Verify email domain allowlist works
3. Test all CRUD operations
4. Verify price upsert logic
5. Optional: Add pagination if data grows large
6. Optional: Add bulk operations if needed
