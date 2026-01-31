# POS Schema Migration - Variant-Based Pricing Implementation

## Overview
Successfully migrated POS app to use variant-based pricing with 2-tier category hierarchy while maintaining backward compatibility.

## Database Schema Changes

### New Tables (from previous migrations)
- `categories` - Main product categories
- `subcategories` - Menu sections linked to categories
- `product_variants` - Product SKUs by size (STD, SIZE_PHE, SIZE_LA)
- `product_variant_prices` - Prices per variant/SKU

### Schema Adjustments
- Added `products.subcategory_id` (FK to subcategories)
- Replaced CHECK constraint on `products.category_code` with FK to `categories.code`
- Added comprehensive indexes for admin performance

### Deprecated Tables (kept for compatibility)
- `product_categories` → Use `categories` instead
- `product_skus` → Use `product_variants` instead
- `product_prices` → Use `product_variant_prices` instead

## Code Changes

### 1. Pricing Engine (`src/app/lib/pricingEngine.ts`)
**Changes:**
- Uses `products.category_code` as primary (fallback to legacy `category`)
- Loads pricing from `product_variants` + `product_variant_prices` first
- Falls back to `product_prices` for products without variants
- Maintains all business rules (FREE_UPSIZE, DISCOUNT scopes)

**Key Features:**
- Single source of truth for pricing logic
- Backward compatible with legacy pricing
- Proper category normalization (DRINK, CAKE, TOPPING, etc.)

### 2. API Routes

#### `/api/price` (Updated)
- Now uses shared `pricingEngine` for consistency
- Converts legacy format to line-based format internally
- Returns same response shape (backward compatible)

#### `/api/quote` (Already correct)
- Already using `pricingEngine`
- No changes needed

### 3. Admin APIs (All with Zod validation)

#### `/api/admin/categories` (Updated)
- Uses `categories` table (not `product_categories`)
- Full CRUD: GET, POST, PATCH
- Validates with Zod schemas
- Returns `{ ok: true, data }` format

#### `/api/admin/subcategories` (New)
- Full CRUD for menu sections
- Enforces unique (category_code, name)
- Validates category exists before creating subcategory
- Returns joined category info

#### `/api/admin/products` (Updated)
- Uses `category_code` and `subcategory_id`
- Loads prices from variants first, legacy fallback
- Supports `menu_section` for backward compatibility
- Zod validation for all inputs

#### `/api/admin/variants` (New)
- Full CRUD for product variants (SKUs)
- Enforces unique `sku_code` globally
- Enforces unique (product_id, size_key)
- Atomic creation of variant + price
- Non-negative price validation

### 4. Database Views

#### `v_products_menu` (Updated)
**Columns:**
- `product_id`, `product_code`, `name`
- `category` - Uses category_code (fallback to legacy)
- `menu_section`, `subcategory_id`
- `price_phe`, `price_la`, `price_std`
- `category_name`, `subcategory_name`

**Features:**
- Reads from variant pricing first
- Falls back to legacy `product_prices`
- Only shows active products
- Joined with categories and subcategories

#### `v_product_prices_compat` (Created)
**Purpose:** Compatibility layer for gradual migration
- Maps variant prices to old `price_key` format
- Allows old code to work without changes

## Migration Files

### 1. `20260131_product_variants_schema.sql`
- Creates all new tables (categories, subcategories, variants, prices)
- Creates size_key enum
- Adds promotion_target_variants for SKU-level promos
- Creates v_product_prices_compat view

### 2. `20260131_product_variants_data.sql`
- Populates categories/subcategories from staging
- Creates variants from staging SKU data
- Migrates prices from old product_prices
- Data validation and reporting

### 3. `20260131_normalize_master_data.sql`
- Migrates product_categories → categories
- Consolidates product_skus → product_variants
- Removes hardcoded category constraints
- Creates compatibility views
- Marks legacy tables as DEPRECATED

### 4. `20260131_products_menu_view_update.sql`
- Updates v_products_menu view
- Adds schema adjustments (subcategory_id, FK constraints)
- Creates indexes for performance

## Migration Order

Run migrations in this order:
```bash
1. 20260131_product_variants_schema.sql       # Schema
2. 20260131_product_variants_data.sql         # Data population
3. 20260131_normalize_master_data.sql         # Consolidation
4. 20260131_products_menu_view_update.sql     # View updates
```

## Backward Compatibility

### ✅ Maintained
- POS UI continues to work (reads from v_products_menu)
- Legacy price queries fallback automatically
- Old promotion scopes work with new categories
- FREE_UPSIZE logic unchanged (display LA, charge PHE)

### 🔄 Gradual Migration Path
1. Run schema migrations
2. Populate variant data
3. Admin can manage via new APIs
4. Old code works via compatibility views
5. Update frontend gradually to use variants directly

## Testing Checklist

### Database
- [ ] All migrations run without errors
- [ ] Categories populated correctly
- [ ] Subcategories linked to categories
- [ ] Variants created for all products
- [ ] Prices migrated correctly
- [ ] Views return expected data

### APIs
- [ ] `/api/quote` returns correct pricing
- [ ] `/api/price` matches quote engine results
- [ ] `/api/admin/categories` CRUD works
- [ ] `/api/admin/subcategories` CRUD works
- [ ] `/api/admin/products` uses new schema
- [ ] `/api/admin/variants` enforces unique SKU

### POS UI
- [ ] Products load from v_products_menu
- [ ] Prices display correctly
- [ ] Promotions apply correctly
- [ ] FREE_UPSIZE shows LA, charges PHE
- [ ] Category filtering works
- [ ] Order submission works

### Business Logic
- [ ] DISCOUNT only applies with include scopes
- [ ] Category matching uses normalized codes
- [ ] FREE_UPSIZE counts eligible drinks only
- [ ] Missing prices handled gracefully

## Performance Considerations

### Indexes Added
- Products: category_code, subcategory_id, code, name, is_active
- Categories: code, is_active
- Subcategories: category_code, is_active
- Variants: product_id, sku_code, is_active
- Promotion targets: promotion_code, variant_id

### Query Optimization
- Parallel data fetching in pricingEngine
- CTE-based view for efficient price lookup
- Proper FK constraints for join optimization

## Next Steps (Future)

1. **Admin UI Updates**
   - Category management interface
   - Subcategory management interface
   - Variant management per product
   - Bulk SKU operations

2. **POS UI Enhancements**
   - Show subcategory sections in menu
   - Display SKU codes in product cards
   - Admin mode for quick price updates

3. **Reporting**
   - Sales by variant/SKU
   - Category performance analysis
   - Promotion effectiveness by variant

4. **Data Cleanup**
   - Archive old product_categories table
   - Archive old product_skus table
   - Consider dropping after validation period

## Notes

- All changes maintain single source of truth principle
- Pricing logic centralized in pricingEngine
- Admin APIs use consistent error format
- Database constraints prevent invalid data
- Comprehensive validation with Zod
- All timestamps auto-updated via triggers
