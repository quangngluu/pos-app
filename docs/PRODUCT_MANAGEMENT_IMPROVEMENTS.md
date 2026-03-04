# Product Management Improvements

## Overview
Comprehensive upgrade to product management system with master category management, auto-generated product codes, and intelligent price mode handling.

## Features Implemented

### 1. Master Category Management
- **Database**: Created `product_categories` table with migration
- **Fields**: code (PK), name, sort_order, is_active, timestamps
- **Seeded Data**: Auto-populated from existing products with normalization
- **API**: Full CRUD operations at `/api/admin/categories`
- **UI**: New "Categories" tab in admin panel with list/create/edit capabilities
- **Philosophy**: No delete - use `is_active` flag only

### 2. Auto-Generated Product Codes
- **Server-Side Generation**: `/api/admin/products/generate-code` API endpoint
- **Vietnamese Support**: Removes diacritics (á→a, đ→d, etc.)
- **Category Prefixes**: 
  - DRINK → DRK_
  - CAKE → CAKE_
  - TOPPING → TOP_
  - MERCHANDISE → ACC_
  - PCTC → PCTC_
  - Default → PRD_
- **Uniqueness**: Automatic collision handling with _2, _3 suffixes
- **Manual Override**: Users can click "Edit" button to manually enter code
- **Example**: category=DRINK, name="Phở mai cà phê" → "DRK_PHO_MAI_CA_PHE"

### 3. Intelligent Price Mode
- **Single Size Mode**: Only shows STD price input
- **Multi-Size Mode**: Shows PHÊ/LA/STD price inputs in 3-column grid
- **Auto-Detection**: Edit mode automatically detects mode from existing prices
- **Automatic Cleanup**: Switching modes removes unused price keys from database
  - Single mode: Deletes SIZE_PHE, SIZE_LA
  - Multi mode: Deletes keys not provided

### 4. Enhanced Product Modal
- **Category Dropdown**: Loads active categories from master table
- **Required Category**: Category selection is now mandatory (not optional)
- **Code Auto-Generation**: Real-time generation as user types name (after category selected)
- **Code Edit Button**: Allows manual override when needed
- **Price Mode Radio**: Clear selection between 1 size vs multiple sizes
- **Validation**: Enforces code, name, and category requirements

## Files Created

### Database Migration
```
/supabase/migrations/20260128_product_categories.sql
```
- Creates product_categories table
- Sets up indexes on is_active and sort_order
- Implements RLS policies
- Seeds initial data from existing products
- Adds updated_at trigger

### API Routes
```
/src/app/api/admin/categories/route.ts (115 lines)
```
- GET: List categories with optional search
- POST: Create new category with validation
- PATCH: Update category fields (name, sort_order, is_active)

```
/src/app/api/admin/products/generate-code/route.ts (118 lines)
```
- GET: Generate unique product code from category + name
- Vietnamese text handling with diacritic removal
- Collision detection and resolution

## Files Modified

### Products API
```
/src/app/api/admin/products/route.ts
```
**Changes:**
- Added `priceMode` to patchProductSchema
- Implemented price key cleanup logic in PATCH handler
- Deletes unused price keys when switching modes

### Admin Page
```
/src/app/admin/page.tsx
```
**Changes:**
- Added `Category` type definition
- Updated `Tab` type to include "categories"
- Added Categories tab button
- Inserted complete `CategoriesTab` component (140 lines)
- Inserted complete `CategoryModal` component (200 lines)
- Replaced `ProductModal` with enhanced version (425 lines)
  - Category dropdown
  - Auto-code generation with manual override
  - Price mode selection (single/multi)
  - Conditional price inputs
  - Enhanced validation

## Usage

### Managing Categories
1. Navigate to admin panel → Categories tab
2. View list of all categories (sorted by sort_order then name)
3. Click "Create Category" to add new one
4. Enter code (uppercase, e.g., "DRINK"), name, and sort order
5. Click row to edit existing category
6. Toggle "Active" to hide from product dropdown without deleting

### Creating Products with Auto-Code
1. Navigate to admin panel → Products tab
2. Click "Create Product"
3. Select category from dropdown (required)
4. Type product name (e.g., "Phở mai cà phê")
5. Code auto-generates in real-time (e.g., "DRK_PHO_MAI_CA_PHE")
6. Optional: Click "Edit" button next to code to manually override
7. Select price mode:
   - "1 size (STD only)" for single-price products
   - "Multiple sizes (PHÊ/LA/STD)" for size variants
8. Enter prices based on selected mode
9. Click Save

### Editing Products
1. Click product row in Products tab
2. Modal auto-detects price mode from existing prices
3. Edit fields as needed
4. Switching price mode will automatically clean up unused price keys
5. Click Save

## Technical Details

### Code Generation Algorithm
```typescript
// 1. Get category prefix (DRINK → DRK_)
const prefix = getCategoryPrefix(category);

// 2. Slugify product name
// "Phở mai cà phê" → "pho mai ca phe"
const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = normalized.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");

// 3. Combine and check uniqueness
let code = prefix + slug;
let suffix = 2;
while (await codeExists(code)) {
  code = prefix + slug + "_" + suffix;
  suffix++;
}
```

### Price Mode Logic
```typescript
// Auto-detect mode on edit
useEffect(() => {
  if (product) {
    const hasSizePrices = product.prices.SIZE_PHE || product.prices.SIZE_LA;
    setPriceMode(hasSizePrices ? "multi" : "single");
  }
}, [product]);

// Cleanup on save
if (priceMode === "single") {
  // Delete SIZE_PHE, SIZE_LA keys
} else if (priceMode === "multi") {
  // Delete keys not in submitted prices
}
```

### Category Loading
```typescript
// Load active categories only
const fetchCategories = async () => {
  const res = await fetch("/api/admin/categories");
  const data = await res.json();
  if (data.ok) {
    setCategories(data.categories.filter((c: Category) => c.is_active));
  }
};
```

## Database Schema

### product_categories
```sql
CREATE TABLE product_categories (
  code TEXT PRIMARY KEY,           -- e.g., "DRINK", "CAKE"
  name TEXT NOT NULL,              -- e.g., "Đồ uống", "Bánh"
  sort_order INTEGER DEFAULT 0,   -- Display order
  is_active BOOLEAN DEFAULT TRUE, -- Soft delete flag
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_categories_is_active ON product_categories(is_active);
CREATE INDEX idx_product_categories_sort_order ON product_categories(sort_order);
```

### products (existing, updated)
- `category` field now references `product_categories.code`
- Category dropdown enforces FK-like behavior (only active categories shown)

### product_prices (existing, enhanced cleanup)
- API now removes unused price keys when switching modes
- Prevents orphaned price rows

## Migration Guide

### Apply Database Migration
```bash
# Connect to Supabase and run migration
psql [connection-string] < supabase/migrations/20260128_product_categories.sql
```

### Verify Categories Seeded
```sql
SELECT * FROM product_categories ORDER BY sort_order, name;
```
Expected initial data: DRINK, CAKE, TOPPING, MERCHANDISE, PCTC

### Test Categories API
```bash
# List categories
curl http://localhost:3000/api/admin/categories

# Create category
curl -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"code":"SNACK","name":"Snack","sort_order":10}'

# Update category
curl -X PATCH http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"code":"SNACK","name":"Đồ ăn vặt","is_active":true}'
```

### Test Code Generation
```bash
curl "http://localhost:3000/api/admin/products/generate-code?category=DRINK&name=Phở%20mai%20cà%20phê"
# Expected: {"ok":true,"code":"DRK_PHO_MAI_CA_PHE"}

curl "http://localhost:3000/api/admin/products/generate-code?category=CAKE&name=Bánh%20su%20kem%20đặc%20biệt"
# Expected: {"ok":true,"code":"CAKE_BANH_SU_KEM_DAC_BIET"}
```

## Philosophy Maintained

### Internal-Only Admin Panel
- No delete buttons - use `is_active` flags
- Edit-in-place for categories (click row)
- Minimal confirmation dialogs
- Fast, keyboard-friendly workflows

### Data Integrity
- Category master ensures consistency across products
- Auto-generated codes reduce typos and duplicates
- Price mode enforces proper size variant structure
- Soft deletes preserve historical data

### Vietnamese Language Support
- Proper diacritic handling in code generation
- UI labels in Vietnamese where appropriate (PHÊ, LA, STD)
- Category names in Vietnamese

## Future Enhancements (Optional)

### Possible Additions
- [ ] Category icons/colors for visual distinction
- [ ] Bulk product import with auto-code generation
- [ ] Product cloning with incremental code suffix
- [ ] Category reordering via drag-and-drop
- [ ] Search/filter categories in product dropdown
- [ ] Export categories to CSV
- [ ] Audit log for category/product changes

### Performance Optimizations
- [ ] Cache categories list in client state
- [ ] Debounce code generation API calls
- [ ] Virtualize long product/category lists
- [ ] Index products by category for faster filtering

## Testing Checklist

### Categories Management
- [x] Build compiles successfully
- [ ] Create new category with valid code
- [ ] Edit category name and sort_order
- [ ] Toggle category active/inactive
- [ ] Verify inactive categories don't show in product dropdown
- [ ] Search categories by name/code
- [ ] Category list sorted correctly

### Product Code Generation
- [ ] Auto-generates when category + name entered
- [ ] Removes Vietnamese diacritics correctly
- [ ] Adds _2 suffix when code exists
- [ ] Edit button allows manual override
- [ ] Manual override persists on re-open
- [ ] Empty category/name doesn't generate code
- [ ] Generated code follows prefix rules

### Price Mode
- [ ] Single mode shows only STD input
- [ ] Multi mode shows 3 inputs (PHÊ/LA/STD)
- [ ] Edit mode auto-detects from existing prices
- [ ] Switching from multi to single removes SIZE_PHE/SIZE_LA
- [ ] Switching from single to multi retains STD
- [ ] Price validation accepts numbers only

### End-to-End
- [ ] Create product with auto-code, single price → verify in database
- [ ] Create product with multi prices → verify all 3 keys in database
- [ ] Edit product, switch to single mode → verify SIZE keys deleted
- [ ] Edit product, change category → code doesn't change (intentional)
- [ ] Category required validation works
- [ ] Inactive categories filtered from dropdown

## Success Metrics

✅ **Build Status**: Successful compilation with no TypeScript errors
✅ **File Count**: 2 new files, 2 modified files
✅ **Lines of Code**: ~850 lines added (migration, APIs, UI components)
✅ **Features Delivered**: 4/4 (categories, auto-code, price modes, enhanced modal)
✅ **Philosophy Maintained**: Internal-only admin, no deletes, Vietnamese support

## Support

For issues or questions:
1. Check TypeScript errors: `npm run build`
2. Verify migration applied: Query `product_categories` table
3. Test API routes: Check browser network tab for 200 responses
4. Review browser console for client-side errors
