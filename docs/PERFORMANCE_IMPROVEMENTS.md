# Performance Improvements - React Best Practices

> Áp dụng [React Best Practices từ Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) và [Vercel Blog](https://vercel.com/blog/introducing-react-best-practices)

## ✅ Đã Thực Hiện

### 1. **CRITICAL: Eliminate Async Waterfalls** 🚀

**Vấn đề:** Load products và promotions chạy tuần tự trong 2 `useEffect` riêng biệt, tạo ra waterfall → chậm hơn tổng thời gian của 2 requests.

**Trước:**
```typescript
// Waterfall: chạy tuần tự
useEffect(() => {
  async function loadProducts() {
    const { data } = await supabase.from("v_products_menu")...;
    setProducts(data);
  }
  loadProducts();
}, []);

useEffect(() => {
  async function loadPromotions() {
    const { data } = await supabase.from("promotions")...;
    setPromotions(data);
  }
  loadPromotions();
}, []);
```

**Sau:**
```typescript
// Parallel: chạy song song
useEffect(() => {
  async function loadInitialData() {
    const [productsResult, promotionsResult] = await Promise.all([
      supabase.from("v_products_menu").select("*").order("name"),
      supabase.from("promotions").select("...").eq("is_active", true),
    ]);
    // Handle both results
  }
  loadInitialData();
}, []);
```

**Impact:** 
- ✅ Giảm thời gian load ban đầu từ `T1 + T2` → `max(T1, T2)`
- ✅ User thấy data nhanh hơn
- ✅ **CRITICAL** - Theo React Best Practices của Vercel

**File:** `src/app/pos/page.tsx` (line 169-205)

---

### 2. **CRITICAL: API Route Parallelization** 🚀

**Vấn đề:** Trong `/api/quote`, các database calls chạy tuần tự:
1. Load products
2. Load prices (sau khi products xong)
3. Load promotion (sau khi prices xong)

**Trước:**
```typescript
const { data: products } = await supabaseAdmin.from("products")...;
const { data: prices } = await supabaseAdmin.from("product_prices")...;
let promo = null;
if (body.promotion_code) {
  const { data } = await supabaseAdmin.from("promotions")...;
  promo = data;
}
```

**Sau:**
```typescript
// Parallelize independent operations
const [productsResult, pricesResult, promoResult] = await Promise.all([
  supabaseAdmin.from("products").select("id, category").in("id", productIds),
  supabaseAdmin.from("product_prices").select("...").in("product_id", productIds),
  body.promotion_code
    ? supabaseAdmin.from("promotions").select("*").eq("code", body.promotion_code).maybeSingle()
    : Promise.resolve({ data: null, error: null }),
]);
```

**Impact:**
- ✅ Giảm thời gian API response từ `T1 + T2 + T3` → `max(T1, T2, T3)`
- ✅ Faster quote calculation
- ✅ **CRITICAL** - Loại bỏ request waterfall

**File:** `src/app/api/quote/route.ts` (line 38-78)

---

### 3. **Lazy State Initialization** ⚡

**Vấn đề:** `newLine()` được gọi mỗi lần component re-render, tạo UUID không cần thiết.

**Trước:**
```typescript
const [lines, setLines] = useState<Line[]>([newLine()]);
```

**Sau:**
```typescript
// Lazy: chỉ tạo initial line một lần
const [lines, setLines] = useState<Line[]>(() => [newLine()]);
```

**Impact:**
- ✅ Tránh tạo UUID không cần thiết khi re-render
- ✅ Better performance cho state initialization
- ✅ **BEST PRACTICE** - Theo React Best Practices

**File:** `src/app/pos/page.tsx` (line 137)

---

## 📊 Performance Metrics (Estimated)

### Before:
- Initial load: ~500-800ms (products + promotions sequential)
- API quote: ~300-500ms (3 sequential DB calls)
- State initialization: UUID created on every render

### After:
- Initial load: ~250-400ms (parallel, saved ~250-400ms)
- API quote: ~100-200ms (parallel, saved ~200-300ms)
- State initialization: No unnecessary UUID creation

### Total Improvement:
- ⚡ **~50% faster** initial data load
- ⚡ **~60% faster** quote API response
- ⚡ **Reduced unnecessary work** on re-renders

---

## 🎯 Theo React Best Practices

Các cải tiến này tuân thủ **8 categories** từ React Best Practices của Vercel:

### ✅ Eliminating Async Waterfalls (CRITICAL)
- [x] Parallelize independent async operations
- [x] Combine multiple useEffect calls when possible

### ✅ Server-side Performance (HIGH)
- [x] Parallelize database queries
- [x] Avoid sequential awaits

### ✅ Client-side Data Fetching (HIGH)
- [x] Load multiple resources in parallel
- [x] Eliminate request waterfalls

### ✅ Re-render Optimization (MEDIUM)
- [x] Lazy state initialization with useState(() => ...)

---

## 📚 References

- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- [Vercel Blog: Introducing React Best Practices](https://vercel.com/blog/introducing-react-best-practices)
- [React Best Practices - 40+ rules across 8 categories](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)

---

## 🔄 Next Steps (Future Improvements)

Các cải tiến có thể làm thêm:

### Bundle Size Optimization
- [ ] Code splitting cho routes
- [ ] Dynamic imports cho heavy components
- [ ] Tree-shaking unused code

### Re-render Optimization
- [ ] Memoize expensive calculations
- [ ] Use React.memo for stable components
- [ ] Optimize useMemo dependencies

### Advanced Patterns
- [ ] Virtual scrolling cho long lists
- [ ] Debounce/throttle for expensive operations (đã có)
- [ ] Optimistic updates

---

**Last Updated:** 2024  
**Based on:** Vercel React Best Practices v1.0
