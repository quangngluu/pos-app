# POS Web - Hệ Thống Điểm Bán Hàng Web

> **Single Source of Truth** - Tài liệu chính thức duy nhất cho project

## 📋 Tổng Quan

**POS Web** là hệ thống điểm bán hàng web-based được xây dựng bằng Next.js 16 và Supabase. Hệ thống hỗ trợ:
- Tạo và quản lý đơn hàng
- Tự động tính giá với chương trình khuyến mãi
- Quản lý khách hàng
- Tích hợp autocomplete địa chỉ
- Xác thực người dùng

## 🚀 Quick Start

```bash
# Clone repository
git clone <repo-url>
cd posweb

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Chỉnh sửa .env.local với các giá trị thực tế

# Run development server
npm run dev

# Open http://localhost:3000
```

## 📦 Dependencies

### Production
```json
{
  "next": "16.0.10",
  "react": "19.2.1",
  "react-dom": "19.2.1",
  "@supabase/supabase-js": "^2.87.1",
  "@supabase/ssr": "^0.8.0",
  "zod": "^4.1.13"
}
```

### Development
```json
{
  "typescript": "^5",
  "tailwindcss": "^4",
  "eslint": "^9",
  "eslint-config-next": "16.0.10",
  "babel-plugin-react-compiler": "1.0.0"
}
```

## 🔑 Environment Variables

Tạo file `.env.local`:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Geoapify (Optional - cho address autocomplete)
GEOAPIFY_API_KEY=your_geoapify_key
```

**⚠️ Security Note:** `SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng ở server-side, không bao giờ expose ra client.

## 🏗️ Project Structure

```
posweb/
├── src/app/
│   ├── api/                    # API Routes
│   │   ├── quote/              # ✅ ACTIVE - Pricing engine mới
│   │   ├── customers/          # ✅ ACTIVE - Customer management
│   │   ├── orders/             # ✅ ACTIVE - Order creation
│   │   ├── geoapify/           # ✅ ACTIVE - Address autocomplete
│   │   └── price/              # ⚠️ LEGACY - Không còn dùng
│   ├── pos/
│   │   └── page.tsx            # Main POS interface
│   ├── login/
│   │   └── page.tsx            # Authentication page
│   └── lib/
│       ├── supabaseAdmin.ts    # Server-side Supabase client
│       └── supabaseClient.ts   # Client-side Supabase client
├── public/                     # Static assets
└── package.json
```

## 🔌 API Endpoints

### ✅ ACTIVE Endpoints

#### 1. **POST** `/api/quote` - Tính Giá Đơn Hàng

**Status:** ✅ **ACTIVE** - Endpoint chính để tính giá

**Description:** Tính giá đơn hàng với promotions, free upsize, và các discount rules. Đây là endpoint được sử dụng trong production.

**Request:**
```json
{
  "promotion_code": "OFFICE_50" | null,
  "lines": [
    {
      "product_id": "uuid",
      "qty": 2,
      "price_key": "SIZE_PHE",
      "options": {
        "sugar": "sugar_code"
      }
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "lines": [
    {
      "product_id": "uuid",
      "qty": 2,
      "display_price_key": "SIZE_LA",
      "charged_price_key": "SIZE_PHE",
      "unit_price_before": 45000,
      "unit_price_after": 45000,
      "line_total_before": 90000,
      "line_total_after": 90000,
      "adjustments": [
        {
          "type": "FREE_UPSIZE",
          "amount": 0
        }
      ]
    }
  ],
  "totals": {
    "subtotal_before": 90000,
    "discount_total": 45000,
    "grand_total": 45000
  },
  "meta": {
    "free_upsize_applied": true,
    "discount_percent": 50,
    "drink_qty": 5
  }
}
```

**Features:**
- Zod validation
- Promotion handling (DISCOUNT/RULE types)
- Free upsize logic
- Scope-based discounts (category matching)
- Original vs final pricing

**Used in:**
- `src/app/pos/page.tsx` (line 281)

---

#### 2. **GET** `/api/customers` - Tìm Khách Hàng Theo Số Điện Thoại

**Status:** ✅ **ACTIVE**

**Description:** Tìm kiếm khách hàng theo số điện thoại, trả về thông tin khách hàng và địa chỉ mặc định.

**Request:**
```
GET /api/customers?phone=0377538625
```

**Response:**
```json
{
  "customer": {
    "id": "uuid",
    "phone_number": "0377538625",
    "customer_name": "Nguyễn Văn A",
    "default_address": "442 Nguyễn Thị Minh Khai, Q3"
  }
}
```

**Features:**
- Phone normalization (chỉ lấy digits)
- Tự động load khi nhập số điện thoại

**Used in:**
- `src/app/pos/page.tsx` (line 219)

---

#### 3. **GET** `/api/customers/search` - Tìm Kiếm Khách Hàng

**Status:** ✅ **ACTIVE** (Optional - có thể dùng cho search interface)

**Description:** Tìm kiếm khách hàng theo số điện thoại (prefix) hoặc tên.

**Request:**
```
GET /api/customers/search?q=037&limit=10
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "phone_number": "0377538625",
      "customer_name": "Nguyễn Văn A",
      "default_address": "442 Nguyễn Thị Minh Khai"
    }
  ]
}
```

**Features:**
- Search by phone prefix (>= 3 digits)
- Search by name (ilike)
- Limit results (max 20)

---

#### 4. **GET** `/api/geoapify/autocomplete` - Autocomplete Địa Chỉ

**Status:** ✅ **ACTIVE**

**Description:** Autocomplete địa chỉ sử dụng Geoapify API, ưu tiên HCM và Hà Nội.

**Request:**
```
GET /api/geoapify/autocomplete?q=442 Nguyễn Thị Minh Khai&limit=6
```

**Response:**
```json
{
  "items": [
    {
      "place_id": "geoapify_place_id",
      "display_name": "442 Nguyễn Thị Minh Khai, Phường 5, Quận 3, Hồ Chí Minh",
      "lat": 10.776,
      "lon": 106.701,
      "address": {
        "housenumber": "442",
        "street": "Nguyễn Thị Minh Khai",
        "district": "Quận 3",
        "city": "Hồ Chí Minh",
        "country": "Việt Nam"
      },
      "raw": { /* full Geoapify feature */ }
    }
  ]
}
```

**Features:**
- Location bias (HCM first, then HN)
- Vietnamese language support
- Vietnam-only filter
- Debounce handling (250ms)

**Used in:**
- `src/app/pos/page.tsx` (line 244)

**Requirements:**
- `GEOAPIFY_API_KEY` environment variable

---

#### 5. **POST** `/api/orders` - Tạo Đơn Hàng

**Status:** ✅ **ACTIVE**

**Description:** Tạo đơn hàng mới và lưu vào database.

**Request:**
```json
{
  "phone": "0377538625",
  "customer_name": "Nguyễn Văn A",
  "default_address": "442 Nguyễn Thị Minh Khai",
  "addr_selected": { /* Geoapify address object */ },
  "note": "Giao trước 14h",
  "promotion_code": "OFFICE_50",
  "pricing": {
    "items_subtotal_before": 200000,
    "items_discount": 100000,
    "tax_total": 0,
    "grand_total": 100000
  },
  "lines": [
    {
      "product_id": "uuid",
      "qty": 2,
      "size": "SIZE_LA",
      "sugar_value_code": "sugar_code",
      "product_name_snapshot": "Cà phê sữa đá",
      "unit_price_snapshot": 45000,
      "line_total": 90000,
      "note": ""
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "order_id": "uuid",
  "order_code": "ORD-2024-001234"
}
```

**Features:**
- Zod validation
- Full order details
- Pricing snapshot
- Address handling

**Used in:**
- `src/app/pos/page.tsx` (line 561)

---

### ⚠️ LEGACY Endpoints

#### **POST** `/api/price` - Tính Giá (Legacy)

**Status:** ⚠️ **LEGACY** - Không còn được sử dụng

**Description:** Endpoint tính giá cũ, đã được thay thế bởi `/api/quote`.

**Migration Path:**
- ✅ **Use:** `/api/quote` instead
- ❌ **Do not use:** `/api/price`

**Reason for Deprecation:**
- `/api/quote` có đầy đủ tính năng hơn
- Hỗ trợ Zod validation
- Response structure rõ ràng hơn
- Better error handling

**Note:** Endpoint này vẫn tồn tại trong codebase nhưng **không được gọi** trong UI. Có thể xóa trong tương lai.

---

## 🗄️ Database Schema

### Tables/Views Sử Dụng

#### 1. `v_products_menu` (View)
- `product_id`, `product_code`, `name`, `category`
- `price_phe`, `price_la`, `price_std`

#### 2. `v_product_sugar_options` (View)
- `product_id`, `value_code`, `label`
- `is_default`, `sort_order`

#### 3. `promotions`
```sql
code VARCHAR PRIMARY KEY
name VARCHAR
promo_type VARCHAR -- 'DISCOUNT' | 'RULE'
percent_off NUMERIC -- For DISCOUNT type
min_qty INTEGER -- For RULE type
priority INTEGER
is_stackable BOOLEAN
is_active BOOLEAN
scope_categories TEXT[] -- Optional: category filter
```

#### 4. `products`
```sql
id UUID PRIMARY KEY
code VARCHAR
category VARCHAR -- 'DRINK' | 'TOP' | 'TOPPING' | 'CAKE' | ...
is_active BOOLEAN
```

#### 5. `product_prices`
```sql
product_id UUID
price_key VARCHAR -- 'SIZE_PHE' | 'SIZE_LA' | 'STD'
price_vat_incl NUMERIC
```

#### 6. `customers`
```sql
id UUID PRIMARY KEY
phone_number VARCHAR UNIQUE
customer_name VARCHAR
default_address TEXT
updated_at TIMESTAMP
```

#### 7. `orders`
```sql
id UUID PRIMARY KEY
order_code VARCHAR UNIQUE
phone VARCHAR
customer_name VARCHAR
default_address TEXT
addr_selected JSONB
note TEXT
promotion_code VARCHAR
pricing JSONB
lines JSONB
created_at TIMESTAMP
```

---

## ⚡ Tính Năng Chính

### 1. POS Interface (`/pos`)

- **Product Selection:** Autocomplete tìm món
- **Size Selection:** Phê (SIZE_PHE) / La (SIZE_LA) / STD
- **Sugar Options:** Tùy chọn đường theo sản phẩm
- **Real-time Pricing:** Tính giá tự động với debounce
- **Promotion Handling:** Áp dụng khuyến mãi
- **Customer Management:** Tìm khách hàng theo số điện thoại
- **Address Autocomplete:** Tích hợp Geoapify
- **Order Creation:** Tạo đơn hàng với validation

### 2. Pricing Engine

- **Promotion Types:**
  - `DISCOUNT`: Giảm % trên giá (có thể giới hạn category)
  - `RULE`: Áp dụng rule (ví dụ: free upsize khi mua >= 5 DRINK)

- **Free Upsize Logic:**
  - Khi đủ số lượng DRINK theo threshold
  - UI hiển thị SIZE_LA nhưng tính giá với SIZE_PHE
  - Tự động chuyển size trong UI

- **Scope Matching:**
  - Promotion có thể giới hạn category
  - Ví dụ: OFFICE_50 chỉ áp dụng cho DRINK + TOPPING

### 3. Authentication (`/login`)

- Supabase Auth
- Session check
- Protected routes

---

## 🔧 Scripts

```bash
# Development
npm run dev          # Start dev server (localhost:3000)

# Production
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint
```

---

## 📝 Code Standards

- **TypeScript:** Strict mode enabled
- **React:** 19.2.1 với React Compiler
- **Validation:** Zod schemas
- **Error Handling:** Try-catch với error messages
- **Debouncing:** API calls debounced (250-300ms)

---

## 🐛 Troubleshooting

### Missing Prices
- Kiểm tra `product_prices` table
- Đảm bảo `price_key` đúng format (SIZE_PHE/SIZE_LA/STD)
- Kiểm tra `is_active` trên products

### Address Autocomplete Not Working
- Kiểm tra `GEOAPIFY_API_KEY` trong `.env.local`
- Verify API key valid
- Check network requests trong browser console

### Customer Not Found
- Kiểm tra format số điện thoại (chỉ digits)
- Verify data trong `customers` table
- Check API response trong network tab

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Zod Documentation](https://zod.dev)
- [Geoapify API](https://www.geoapify.com/)

---

## 🔄 Changelog

### v0.1.0 (Current)
- ✅ `/api/quote` - Active pricing engine
- ✅ `/api/customers` - Customer management
- ✅ `/api/geoapify/autocomplete` - Address autocomplete
- ✅ `/api/orders` - Order creation
- ⚠️ `/api/price` - Legacy (không dùng)

### Performance Improvements (2024)
- ✅ **CRITICAL:** Eliminated async waterfalls - Parallelize products & promotions loading
- ✅ **CRITICAL:** API route parallelization - Load products, prices, promotion concurrently
- ✅ **BEST PRACTICE:** Lazy state initialization with `useState(() => ...)`
- 📊 **~50% faster** initial data load
- 📊 **~60% faster** quote API response
- 📖 See [PERFORMANCE_IMPROVEMENTS.md](./PERFORMANCE_IMPROVEMENTS.md) for details

---

## 📞 Support

Để hỗ trợ hoặc báo lỗi, vui lòng liên hệ team phát triển.

---

**Last Updated:** 2024  
**Version:** 0.1.0  
**Maintainer:** POS Web Team
