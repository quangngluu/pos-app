# CONTEXT PACK – POS Web Application

> **Purpose**: A comprehensive technical overview of this repository for external analysis. This document enables accurate feature development without over-engineering.  
> **Generated**: 2025-01  
> **⚠️ CONFIDENTIAL**: Do not commit secrets. This file is safe to share.

---

## Table of Contents

0. [Tech Stack](#0-tech-stack)
1. [Directory Structure](#1-directory-structure)
2. [Entry Points](#2-entry-points)
3. [Architecture](#3-architecture)
4. [Data Layer](#4-data-layer)
5. [External Integrations](#5-external-integrations)
6. [Async / Background Jobs](#6-async--background-jobs)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Observability](#8-observability)
9. [Testing](#9-testing)
10. [Critical Paths](#10-critical-paths)
11. [Hotspots & Tech Debt](#11-hotspots--tech-debt)
12. [Important Files Index](#12-important-files-index)

---

## 0. Tech Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Framework** | Next.js | 16.0.10 | App Router (not Pages Router) |
| **UI Library** | React | 19.2.1 | Client components + Server components |
| **Language** | TypeScript | 5.x | Strict mode enabled |
| **Styling** | Tailwind CSS | 4.x | With custom design tokens |
| **Database** | PostgreSQL | (Supabase) | Hosted on Supabase |
| **Auth** | Supabase Auth | @supabase/ssr | SSR cookie-based sessions |
| **Validation** | Zod | 4.1.13 | Runtime schema validation |
| **Runtime** | Node.js | (not pinned) | Uses `runtime = "nodejs"` in routes |

### Key Dependencies

```json
{
  "next": "16.0.10",
  "react": "19.2.1",
  "react-dom": "19.2.1",
  "@supabase/supabase-js": "2.x",
  "@supabase/ssr": "latest",
  "zod": "4.1.13",
  "pg": "latest",
  "tailwindcss": "4.x"
}
```

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev --turbopack` | Local development with Turbopack |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `lint` | `next lint` | ESLint check |

---

## 1. Directory Structure

```
/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout (light theme forced)
│   │   ├── page.tsx              # Home page (redirects to /pos)
│   │   ├── globals.css           # Global styles + Tailwind
│   │   │
│   │   ├── admin/                # Admin panel pages
│   │   │   ├── page.tsx          # Admin dashboard
│   │   │   ├── categories/       # Category management
│   │   │   ├── products/         # Product management
│   │   │   ├── promotions/       # Promotion management
│   │   │   ├── stores/           # Store management
│   │   │   └── variants/         # Variant management
│   │   │
│   │   ├── api/                  # API routes
│   │   │   ├── admin/            # Admin-only APIs (auth required)
│   │   │   │   ├── categories/
│   │   │   │   ├── products/
│   │   │   │   ├── promotions/
│   │   │   │   ├── stores/
│   │   │   │   ├── subcategories/
│   │   │   │   └── variants/
│   │   │   │
│   │   │   ├── customers/        # Customer lookup
│   │   │   ├── orders/           # Order creation
│   │   │   ├── places/           # Google Places proxy
│   │   │   ├── price/            # Price lookup
│   │   │   ├── quote/            # Quote calculation
│   │   │   ├── stores/           # Store listing
│   │   │   └── telegram/         # Telegram bot webhook
│   │   │
│   │   ├── components/           # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── index.ts          # Barrel export
│   │   │
│   │   ├── lib/                  # Shared utilities
│   │   │   ├── pricingEngine.ts  # ⭐ Core pricing logic
│   │   │   ├── supabaseAdmin.ts  # Service role client
│   │   │   ├── supabaseClient.ts # Browser client (SSR)
│   │   │   ├── requireAuth.ts    # Auth middleware
│   │   │   └── designTokens.ts   # Design system tokens
│   │   │
│   │   ├── login/                # Login page
│   │   │   └── page.tsx
│   │   │
│   │   └── pos/                  # ⭐ Main POS interface
│   │       └── page.tsx          # 2558 lines - main UI
│   │
│   └── lib/
│       └── supabase/
│           └── server.ts         # Server-side Supabase helper
│
├── supabase/
│   └── migrations/               # Database migrations (SQL)
│       ├── 20260117_nearest_store.sql
│       ├── 20260127_orders_created_by.sql
│       ├── 20260128_product_categories.sql
│       ├── 20260128_promotion_targets.sql
│       ├── 20260128_stores_structured_address.sql
│       └── ...
│
├── scripts/                      # Utility scripts
│   ├── run-diagnostics.mjs
│   ├── check-schema.mjs
│   └── ...
│
├── docs/                         # Documentation
├── public/                       # Static assets
└── [config files]                # next.config.ts, tsconfig.json, etc.
```

---

## 2. Entry Points

### Web Application

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Redirects to `/pos` |
| `/pos` | `src/app/pos/page.tsx` | Main POS interface |
| `/login` | `src/app/login/page.tsx` | Authentication |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard |
| `/admin/*` | `src/app/admin/*/page.tsx` | Admin sub-pages |

### API Routes

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/quote` | POST | No | Calculate order pricing |
| `/api/orders` | POST | Yes | Create order |
| `/api/orders` | GET | No | List orders |
| `/api/customers` | GET | No | Lookup customer by phone |
| `/api/stores` | GET | No | List stores |
| `/api/places/autocomplete` | GET | No | Google Places proxy |
| `/api/price` | GET | No | Get price for product+variant |
| `/api/telegram/webhook` | POST | No* | Telegram bot callbacks |
| `/api/admin/*` | ALL | Yes | Admin CRUD operations |

> *Telegram webhook has no auth but validates via Telegram's callback system

---

## 3. Architecture

### Pattern: "Fat Client + Thin API"

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│  ┌─────────────────────────────────────────────────────┐│
│  │              pos/page.tsx (Client)                  ││
│  │  - Full cart state                                  ││
│  │  - UI interactions                                  ││
│  │  - Calls /api/quote for pricing                     ││
│  │  - Calls /api/orders to submit                      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js API Routes                    │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  /api/quote     │  │  /api/orders                │  │
│  │  - No auth      │  │  - requireUser()            │  │
│  │  - pricingEngine│  │  - Re-runs pricingEngine    │  │
│  │  - Read-only    │  │  - Saves to DB              │  │
│  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                 │
│  - products, product_variants, product_variant_prices   │
│  - categories, subcategories                            │
│  - promotions, promotion_scopes, promotion_rules        │
│  - stores, orders, customers                            │
│  - Row Level Security (RLS) enabled                     │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **No ORM**: Direct Supabase client queries
2. **No Redux/Zustand**: Local React state in page components
3. **Server-side price validation**: Client quotes are re-validated server-side
4. **Monolith**: No microservices, everything in one Next.js app
5. **SSR Auth**: Cookies-based auth via `@supabase/ssr`

---

## 4. Data Layer

### Database: Supabase (PostgreSQL)

#### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `products` | Product catalog | `id`, `name`, `category_code`, `subcategory_id`, `is_active` |
| `product_variants` | Size/variant definitions | `id`, `product_id`, `name`, `price_key` |
| `product_variant_prices` | Variant pricing | `variant_id`, `price`, `is_active` |
| `categories` | Product categories | `id`, `code`, `name` |
| `subcategories` | Sub-categories | `id`, `category_id`, `code`, `name` |
| `stores` | Store locations | `id`, `name`, `address`, `lat`, `lng`, `geom` |
| `orders` | Completed orders | `id`, `order_code`, `status`, `total`, `items` (JSONB) |
| `customers` | Customer records | `id`, `phone_number`, `customer_name`, `default_address` |
| `promotions` | Promotion definitions | `id`, `code`, `name`, `is_active`, `start_date`, `end_date` |
| `promotion_scopes` | What promotions apply to | `id`, `promotion_id`, `scope_type` |
| `promotion_scope_targets` | Scope target items | `id`, `scope_id`, `target_type`, `target_id`, `is_included` |
| `promotion_rules` | Rule logic | `id`, `promotion_id`, `conditions` (JSONB), `actions` (JSONB) |

#### Migrations

Located in `supabase/migrations/`. Applied manually or via Supabase dashboard.

Naming convention: `YYYYMMDD_description.sql`

#### Client Setup

**Admin Client** (`src/app/lib/supabaseAdmin.ts`):
```typescript
// Uses SUPABASE_SERVICE_ROLE_KEY
// Bypasses RLS - use only in API routes
```

**Browser Client** (`src/app/lib/supabaseClient.ts`):
```typescript
// Uses NEXT_PUBLIC_SUPABASE_ANON_KEY
// Respects RLS
```

**Server Client** (`src/lib/supabase/server.ts`):
```typescript
// SSR client with cookie management
// For Server Components and API routes
```

---

## 5. External Integrations

### 1. Supabase

| Service | Usage |
|---------|-------|
| **Database** | PostgreSQL with RLS |
| **Auth** | Email/password, magic link |
| **Storage** | (Not currently used) |
| **Realtime** | (Not currently used) |

### 2. Google Places API

- **Endpoint**: `/api/places/autocomplete`
- **Purpose**: Address autocomplete for delivery
- **Env var**: `GOOGLE_PLACE_API_KEY`

### 3. Telegram Bot API

- **Endpoint**: `/api/telegram/webhook`
- **Purpose**: Order status notifications & updates
- **Features**: Inline keyboard for status changes
- **⚠️ Issue**: Bot token is hardcoded (should be env var)

---

## 6. Async / Background Jobs

### Current State: **None**

- No job queues (Bull, BullMQ, etc.)
- No cron jobs
- No scheduled tasks
- All operations are synchronous request/response

### Telegram Webhook

The only "background-like" operation is the Telegram webhook which:
1. Receives callbacks from Telegram
2. Updates order status in DB
3. Updates Telegram message buttons

This is still synchronous per-request.

---

## 7. Authentication & Authorization

### Auth Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   /login page   │────▶│  Supabase Auth  │────▶│  Set cookies    │
│  (email/pass)   │     │  signInWith...  │     │  (SSR session)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Auth Middleware

**File**: `src/app/lib/requireAuth.ts`

```typescript
// Usage in API routes:
const user = await requireUser(req);
if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Features:
- Validates Supabase session from cookies
- Optional email domain allowlist via `INTERNAL_EMAIL_DOMAIN`
- Returns user object or null

### Auth Requirements by Route

| Route Pattern | Auth Required | Notes |
|---------------|---------------|-------|
| `/api/admin/*` | ✅ Yes | All admin operations |
| `/api/orders` POST | ✅ Yes | Creating orders |
| `/api/quote` | ❌ No | Public pricing |
| `/api/stores` | ❌ No | Public store list |
| `/api/customers` | ❌ No | Phone lookup |
| `/pos` | ❌ No* | POS accessible without login |
| `/admin/*` | ✅ Yes | Admin pages |

> *POS page is accessible but order submission requires auth

---

## 8. Observability

### Current State: **Minimal**

| Tool | Status | Notes |
|------|--------|-------|
| Structured Logging | ❌ | Uses `console.log`, `console.error`, `console.debug` |
| APM | ❌ | No Datadog, New Relic, etc. |
| Error Tracking | ❌ | No Sentry, Bugsnag, etc. |
| Metrics | ❌ | No Prometheus, StatsD, etc. |
| Tracing | ❌ | No OpenTelemetry |

### Logging Pattern

```typescript
// Errors
console.error("[context]", error.message);

// Debug (dev only)
console.debug("[pricingEngine]", "details...");
```

### Recommendations for Production

1. Add Sentry for error tracking
2. Add structured logging (Pino, Winston)
3. Use Vercel Analytics if deployed on Vercel

---

## 9. Testing

### Current State: **No Test Suite**

| Type | Status | Files |
|------|--------|-------|
| Unit Tests | ❌ | None |
| Integration Tests | ❌ | None |
| E2E Tests | ❌ | None |
| Test Framework | ❌ | Not configured |

### Quality Tools

| Tool | Status | Config |
|------|--------|--------|
| ESLint | ✅ | `eslint.config.mjs` |
| TypeScript | ✅ | `tsconfig.json` (strict) |
| Prettier | ❌ | Not configured |

### ESLint Config

```javascript
// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ ... });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
```

---

## 10. Critical Paths

### Path 1: Quote Flow (Price Calculation)

```
POS UI ──▶ POST /api/quote ──▶ pricingEngine.quoteOrder() ──▶ Response
                                      │
                                      ├── Load products
                                      ├── Load variants + prices
                                      ├── Load legacy prices (fallback)
                                      ├── Load promotion rules
                                      ├── Apply scope matching
                                      ├── Calculate line totals
                                      └── Apply discounts
```

**Key file**: `src/app/lib/pricingEngine.ts`

### Path 2: Order Creation

```
POS UI ──▶ POST /api/orders ──▶ requireUser() ──▶ pricingEngine.quoteOrder()
                                                          │
                                                          ▼
                                                  Re-validate pricing
                                                          │
                                                          ▼
                                                  Insert into orders table
                                                          │
                                                          ▼
                                                  Send Telegram notification
```

**Key file**: `src/app/api/orders/route.ts`

### Path 3: Promotion Matching

```
quoteOrder() receives promotion_code
       │
       ▼
Load promotion + rules + scopes
       │
       ▼
For each line item:
  ├── Get product category/subcategory
  ├── Normalize category string
  ├── Check scope targets (include/exclude)
  └── Mark as eligible or not
       │
       ▼
Apply rules to eligible items
  ├── PERCENT_OFF
  ├── AMOUNT_OFF
  ├── AMOUNT_OFF_PER_ITEM
  └── FREE_ITEM
```

**Key file**: `src/app/lib/pricingEngine.ts` (lines 300-600)

---

## 11. Hotspots & Tech Debt

### 🔴 Critical Hotspots

| File | Lines | Issue |
|------|-------|-------|
| `src/app/pos/page.tsx` | 2558 | Massive monolith component |
| `src/app/lib/pricingEngine.ts` | 899 | Complex, hard to test |
| `src/app/api/telegram/webhook/route.ts` | 214 | **Hardcoded bot token** |

### 🟡 Tech Debt

1. **No test coverage**: Any change risks regression
2. **Giant components**: `pos/page.tsx` should be split
3. **Hardcoded values**: Telegram token, some status labels
4. **No API versioning**: Breaking changes affect all clients
5. **Legacy price fallback**: Dual pricing system adds complexity
6. **No rate limiting**: APIs vulnerable to abuse

### 🟢 Well-Structured Areas

1. **Design system**: Clean component library in `src/app/components/`
2. **Auth middleware**: Reusable `requireAuth.ts`
3. **Supabase clients**: Clear separation (admin vs browser)
4. **Migrations**: Proper SQL migration files

---

## 12. Important Files Index

### Core Business Logic

| File | Purpose | Priority |
|------|---------|----------|
| [src/app/lib/pricingEngine.ts](src/app/lib/pricingEngine.ts) | Pricing calculation | ⭐⭐⭐ |
| [src/app/pos/page.tsx](src/app/pos/page.tsx) | Main POS interface | ⭐⭐⭐ |
| [src/app/api/orders/route.ts](src/app/api/orders/route.ts) | Order creation | ⭐⭐⭐ |
| [src/app/api/quote/route.ts](src/app/api/quote/route.ts) | Quote endpoint | ⭐⭐ |

### Authentication

| File | Purpose |
|------|---------|
| [src/app/lib/requireAuth.ts](src/app/lib/requireAuth.ts) | Auth middleware |
| [src/app/login/page.tsx](src/app/login/page.tsx) | Login UI |
| [src/lib/supabase/server.ts](src/lib/supabase/server.ts) | Server auth helper |

### Data Access

| File | Purpose |
|------|---------|
| [src/app/lib/supabaseAdmin.ts](src/app/lib/supabaseAdmin.ts) | Admin DB client |
| [src/app/lib/supabaseClient.ts](src/app/lib/supabaseClient.ts) | Browser DB client |

### Admin APIs

| File | Purpose |
|------|---------|
| [src/app/api/admin/products/route.ts](src/app/api/admin/products/route.ts) | Product CRUD |
| [src/app/api/admin/promotions/route.ts](src/app/api/admin/promotions/route.ts) | Promotion CRUD |
| [src/app/api/admin/categories/route.ts](src/app/api/admin/categories/route.ts) | Category CRUD |
| [src/app/api/admin/stores/route.ts](src/app/api/admin/stores/route.ts) | Store CRUD |

### UI Components

| File | Purpose |
|------|---------|
| [src/app/components/index.ts](src/app/components/index.ts) | Component exports |
| [src/app/lib/designTokens.ts](src/app/lib/designTokens.ts) | Design system |

### Configuration

| File | Purpose |
|------|---------|
| [next.config.ts](next.config.ts) | Next.js config |
| [tsconfig.json](tsconfig.json) | TypeScript config |
| [eslint.config.mjs](eslint.config.mjs) | ESLint config |
| [package.json](package.json) | Dependencies & scripts |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role (admin) |
| `GOOGLE_PLACE_API_KEY` | ✅ | Google Places API |
| `INTERNAL_EMAIL_DOMAIN` | ❌ | Optional domain allowlist |

---

## Quick Reference: Adding Features

### Adding a new API endpoint

1. Create `src/app/api/[name]/route.ts`
2. Export `GET`, `POST`, `PUT`, `DELETE` as needed
3. Use `supabaseAdmin` for DB access
4. Add auth with `requireUser()` if needed
5. Validate input with Zod

### Adding an admin page

1. Create `src/app/admin/[name]/page.tsx`
2. Mark as `"use client"` for interactivity
3. Use components from `src/app/components/`
4. Call admin APIs via `fetch('/api/admin/...')`

### Modifying pricing logic

1. Edit `src/app/lib/pricingEngine.ts`
2. Test via `/api/quote` endpoint
3. Order creation auto-uses updated logic

### Adding a new promotion type

1. Add action type to `PromotionAction` in `pricingEngine.ts`
2. Handle new type in `applyPromotionRules()` function
3. Update admin UI in `src/app/admin/promotions/`

---

*End of CONTEXT PACK*
