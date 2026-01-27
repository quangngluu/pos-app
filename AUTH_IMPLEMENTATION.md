# Internal Access Control Implementation

## Summary

Implemented internal-only access control for the POS system using Supabase authentication.

## Files Created

### 1. `/src/middleware.ts` - Route Protection
- Protects `/pos/*` and `/api/*` routes
- Redirects unauthenticated users to `/login?redirect=<path>`
- Returns 401 JSON for unauthenticated API calls
- Optional email domain allowlist check (`INTERNAL_EMAIL_DOMAIN`)

### 2. `/src/app/lib/requireAuth.ts` - API Auth Helper
- Reusable function `requireUser()` for API route handlers
- Returns `{ ok: true, user }` or `{ ok: false, response: NextResponse }`
- Enforces authentication and optional domain allowlist
- Easy to use: Just check `if (!auth.ok) return auth.response;`

### 3. `/src/app/api/orders/route.ts` - Updated
- Added `requireUser()` check at top of POST handler
- Saves `created_by: user.id` when creating orders
- No changes to pricing logic (server-side recompute still works)

## Environment Variables

Add to `.env.local` (optional):

```bash
# Optional: Restrict to specific email domain
# If set, only emails ending with @phela.vn can access
INTERNAL_EMAIL_DOMAIN=phela.vn
```

## Testing Checklist

### ✅ Test 1: Unauthenticated Access (Page)
```bash
# Open in incognito/private window
1. Navigate to: http://localhost:3000/pos
2. Expected: Redirected to /login?redirect=/pos
```

### ✅ Test 2: Unauthenticated Access (API)
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"lines": []}'

# Expected: {"ok":false,"error":"UNAUTHORIZED"}
# Status: 401
```

### ✅ Test 3: Authenticated Order Creation
```bash
1. Login via /login page
2. Navigate to /pos
3. Create an order with products
4. Check Supabase orders table:

SELECT id, created_by, customer_id, total, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 1;

# Expected: created_by field populated with user UUID
```

### ✅ Test 4: Email Domain Allowlist (if configured)
```bash
# Set INTERNAL_EMAIL_DOMAIN=phela.vn in .env.local

1. Login with email NOT ending in @phela.vn (e.g., test@gmail.com)
2. Try to access /pos or /api/orders
3. Expected (API): {"ok":false,"error":"FORBIDDEN: Email domain not allowed"}
4. Expected (Page): Redirected to /login?error=domain_not_allowed
5. Status: 403
```

### ✅ Test 5: Read-Only API Routes Protected
```bash
# All API routes require auth via middleware
curl http://localhost:3000/api/quote -X POST -H "Content-Type: application/json" -d '{}'
curl http://localhost:3000/api/stores/nearest?lat=10&lng=106
curl http://localhost:3000/api/customers/search?q=test

# Expected: All return 401 when not authenticated
# But return data when authenticated (via browser session)
```

## Architecture

### Middleware Layer
- **Protection**: All `/pos` pages and `/api` routes
- **Behavior**: 
  - Unauthenticated → redirect (pages) or 401 (API)
  - Domain check (optional) → redirect (pages) or 403 (API)
- **Exceptions**: `/login`, `/api/auth/*` (Supabase auth callbacks)

### API Layer
- **Write Operations**: Must call `requireUser()` explicitly
  - `/api/orders` POST ✅ (implemented)
  - Future: `/api/customers` CREATE/UPDATE (when added)
- **Read Operations**: Protected by middleware only
  - `/api/quote` POST
  - `/api/stores/*` GET
  - `/api/customers/search` GET
  - `/api/price` POST
  - etc.

### Database
- **orders.created_by**: Populated with authenticated user ID
- **Query**: Track who created each order

```sql
-- Example: See orders by user
SELECT 
  o.id, 
  o.order_code,
  o.created_by,
  u.email as created_by_email,
  o.total,
  o.created_at
FROM orders o
LEFT JOIN auth.users u ON o.created_by = u.id
ORDER BY o.created_at DESC;
```

## Security Features

1. **Authentication Required**: All internal routes require login
2. **API Route Protection**: Returns structured JSON errors (401/403)
3. **Page Protection**: Redirects with return path preserved
4. **Email Allowlist**: Optional domain restriction for extra security
5. **Audit Trail**: `created_by` field tracks which user created orders
6. **Session Management**: Uses Supabase cookie-based sessions

## Development Notes

- **Middleware**: Runs on EVERY request matching `/pos/*` or `/api/*`
- **Performance**: Middleware is edge-compatible and fast
- **Cookies**: Uses `@supabase/ssr` for proper cookie handling in App Router
- **No Breaking Changes**: Existing pricing/quote logic unchanged

## Future Enhancements

Consider adding `requireUser()` to these routes when implemented:
- `/api/customers` POST/PUT/DELETE (create/update customers)
- `/api/products` POST/PUT/DELETE (if product management added)
- `/api/stores` POST/PUT/DELETE (if store management added)

## Troubleshooting

### Issue: Infinite redirect loop
**Cause**: User logged in but email domain not allowed  
**Fix**: Either remove `INTERNAL_EMAIL_DOMAIN` or use allowed email

### Issue: 401 on authenticated requests
**Cause**: Cookie not being sent (CORS issue)  
**Fix**: Ensure requests from same domain or include credentials

### Issue: TypeScript errors in middleware
**Cause**: Missing types from `@supabase/ssr`  
**Fix**: Already included in dependencies, restart TS server

## Migration Notes

**Database Changes Required:**

```sql
-- Add created_by column to orders table (if not exists)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);

-- Add comment
COMMENT ON COLUMN public.orders.created_by IS 'User who created this order';
```

**No Data Migration Needed:** Existing orders will have `created_by = NULL`, which is fine.
