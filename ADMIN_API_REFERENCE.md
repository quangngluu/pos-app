# Admin API Reference - Variant-Based Schema

## Categories API

### GET `/api/admin/categories?q=search`
List all categories with optional search.

**Query Parameters:**
- `q` (optional) - Search by code or name

**Response:**
```json
{
  "ok": true,
  "categories": [
    {
      "code": "DRINK",
      "name": "Drinks",
      "sort_order": 1,
      "is_active": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### POST `/api/admin/categories`
Create a new category.

**Body:**
```json
{
  "code": "DRINK",
  "name": "Drinks",
  "sort_order": 1,
  "is_active": true
}
```

**Validation:**
- `code` - Required, max 50 chars, auto-uppercased
- `name` - Required, max 200 chars
- `sort_order` - Optional, default 0
- `is_active` - Optional, default true

### PATCH `/api/admin/categories`
Update existing category.

**Body:**
```json
{
  "code": "DRINK",
  "patch": {
    "name": "Beverages",
    "sort_order": 2,
    "is_active": false
  }
}
```

---

## Subcategories API

### GET `/api/admin/subcategories?category_code=DRINK&q=search`
List subcategories with optional filters.

**Query Parameters:**
- `category_code` (optional) - Filter by parent category
- `q` (optional) - Search by name

**Response:**
```json
{
  "ok": true,
  "subcategories": [
    {
      "id": "uuid",
      "category_code": "DRINK",
      "name": "Coffee",
      "sort_order": 1,
      "is_active": true,
      "categories": {
        "code": "DRINK",
        "name": "Drinks"
      },
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### POST `/api/admin/subcategories`
Create a new subcategory.

**Body:**
```json
{
  "category_code": "DRINK",
  "name": "Coffee",
  "sort_order": 1,
  "is_active": true
}
```

**Validation:**
- `category_code` - Required, must exist in categories
- `name` - Required, max 200 chars
- Unique constraint: (category_code, name)

### PATCH `/api/admin/subcategories`
Update existing subcategory.

**Body:**
```json
{
  "id": "uuid",
  "patch": {
    "name": "Premium Coffee",
    "sort_order": 2,
    "is_active": false
  }
}
```

---

## Products API

### GET `/api/admin/products?q=search&category=DRINK&active=true`
List products with optional filters.

**Query Parameters:**
- `q` (optional) - Search by name or code
- `category` (optional) - Filter by category_code
- `active` (optional) - Filter by is_active

**Response:**
```json
{
  "ok": true,
  "products": [
    {
      "id": "uuid",
      "code": "LATTE",
      "name": "Caffe Latte",
      "category_code": "DRINK",
      "subcategory_id": "uuid",
      "menu_section": "Coffee",
      "is_active": true,
      "created_at": "...",
      "prices": {
        "SIZE_PHE": 45000,
        "SIZE_LA": 55000,
        "STD": 35000
      }
    }
  ]
}
```

**Note:** Prices loaded from variants first, fallback to legacy product_prices.

### POST `/api/admin/products`
Create a new product.

**Body:**
```json
{
  "code": "LATTE",
  "name": "Caffe Latte",
  "category_code": "DRINK",
  "subcategory_id": "uuid",
  "menu_section": "Coffee",
  "is_active": true,
  "prices": {
    "SIZE_PHE": 45000,
    "SIZE_LA": 55000,
    "STD": 35000
  }
}
```

**Validation:**
- `code` - Required, unique
- `name` - Required
- `category_code` - Optional, must exist in categories
- `subcategory_id` - Optional, must exist in subcategories
- `prices` - Optional, creates variants + prices atomically

### PATCH `/api/admin/products`
Update existing product.

**Body:**
```json
{
  "id": "uuid",
  "patch": {
    "name": "Premium Latte",
    "category_code": "DRINK",
    "subcategory_id": "uuid",
    "is_active": true
  },
  "prices": {
    "SIZE_PHE": 50000,
    "SIZE_LA": 60000
  }
}
```

---

## Product Variants API

### GET `/api/admin/variants?product_id=uuid`
List product variants with prices.

**Query Parameters:**
- `product_id` (optional) - Filter by product

**Response:**
```json
{
  "ok": true,
  "variants": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_code": "LATTE",
      "product_name": "Caffe Latte",
      "size_key": "SIZE_PHE",
      "sku_code": "LATTE_PHE",
      "is_active": true,
      "sort_order": 2,
      "price_vat_incl": 45000,
      "price_updated_at": "...",
      "created_at": "..."
    }
  ]
}
```

### POST `/api/admin/variants`
Create a new product variant with price.

**Body:**
```json
{
  "product_id": "uuid",
  "size_key": "SIZE_PHE",
  "sku_code": "LATTE_PHE",
  "is_active": true,
  "sort_order": 2,
  "price_vat_incl": 45000
}
```

**Validation:**
- `product_id` - Required, must exist
- `size_key` - Required, enum: STD, SIZE_PHE, SIZE_LA
- `sku_code` - Required, globally unique
- `price_vat_incl` - Required, non-negative
- Unique constraint: (product_id, size_key)

**Atomicity:** Variant and price created together or both fail.

### PATCH `/api/admin/variants`
Update variant and/or price.

**Body:**
```json
{
  "id": "uuid",
  "patch": {
    "sku_code": "LATTE_PHE_V2",
    "is_active": true,
    "sort_order": 3
  },
  "price_vat_incl": 48000
}
```

**Note:** Price update creates/updates product_variant_prices record.

---

## Error Response Format

All endpoints return errors in consistent format:

```json
{
  "ok": false,
  "error": "Error message",
  "detail": "Additional details or validation errors"
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad request / Validation error
- `404` - Not found
- `500` - Server error

---

## Pricing Engine Integration

### `/api/quote` (Line-based)
**Body:**
```json
{
  "promotion_code": "FREE_UPSIZE_5",
  "lines": [
    {
      "line_id": "uuid",
      "product_id": "uuid",
      "qty": 2,
      "price_key": "SIZE_PHE",
      "options": {}
    }
  ]
}
```

**Uses:** Shared pricingEngine with variant pricing.

### `/api/price` (Legacy format)
**Body:**
```json
{
  "promotion_code": "DISCOUNT_20",
  "lines": [
    {
      "product_id": "uuid",
      "size": "SIZE_PHE",
      "qty": 2
    }
  ]
}
```

**Uses:** Shared pricingEngine (internally converts to line-based format).

---

## Best Practices

### Creating Products with Variants
1. Create product first (POST `/api/admin/products`)
2. Create variants for each size (POST `/api/admin/variants`)
3. Each variant automatically gets its price

### Updating Prices
- Option 1: PATCH `/api/admin/variants` with `price_vat_incl`
- Option 2: PATCH `/api/admin/products` with `prices` object

### Category Hierarchy
1. Create categories first
2. Create subcategories linked to categories
3. Assign products to both category_code and subcategory_id

### SKU Naming Convention
Recommended format: `{PRODUCT_CODE}_{SIZE_KEY}`
- Example: `LATTE_PHE`, `LATTE_LA`, `CAKE001_STD`

### Deactivation (Soft Delete)
- Set `is_active: false` instead of deleting
- Maintains referential integrity
- Allows historical data analysis
