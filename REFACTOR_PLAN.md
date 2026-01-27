# Refactor Plan - POS Web Project

> Dựa trên code analysis của 3 files chính: `pos/page.tsx`, `api/orders/route.ts`, `package.json`

## 📊 Current State Analysis

### File Size & Complexity
- **`pos/page.tsx`**: 1084 lines - **CRITICAL** - Quá lớn, vi phạm Single Responsibility
- **`api/orders/route.ts`**: 249 lines - **MEDIUM** - Logic phức tạp nhưng manageable
- **`api/quote/route.ts`**: 212 lines - **GOOD** - Đã có parallelization

### Main Issues

#### 1. **Monolithic Component** (CRITICAL)
- `PosPage` component 1084 lines
- Quá nhiều responsibilities:
  - State management (20+ useState)
  - Data fetching (products, promotions, customer, address, quote)
  - Business logic (pricing, calculations)
  - UI rendering (toàn bộ form)

#### 2. **State Management Issues** (HIGH)
- 20+ useState riêng lẻ → Khó maintain
- Related state không grouped (customer, delivery, shipping)
- No state persistence/recovery

#### 3. **Code Duplication** (MEDIUM)
- Sugar options loading logic lặp lại (ensureSugarOptions + fetchSugarOptions)
- Similar error handling patterns
- Address parsing có thể reuse

#### 4. **Business Logic Mixed with UI** (HIGH)
- Calculation logic trong component
- Validation logic scattered
- Message generation logic trong component

#### 5. **API Route Issues** (MEDIUM)
- Sequential operations: customer lookup → update/create → order → order_lines → promotions
- Có thể parallelize một số operations

#### 6. **Type Safety** (MEDIUM)
- Types defined inline trong component
- No shared types file
- `any` types trong promotions state

#### 7. **Styling** (LOW)
- Inline styles thay vì Tailwind classes (Tailwind đã có trong dependencies)
- Khó maintain và reuse

---

## 🎯 Refactor Strategy

### Phase 1: Extract Custom Hooks (HIGH PRIORITY)

#### 1.1 `src/app/pos/hooks/useProducts.ts`
```typescript
// Extract: Products & Promotions loading
export function useProducts() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load both in parallel
  useEffect(() => { ... }, []);
  
  return { products, promotions, loading };
}
```

#### 1.2 `src/app/pos/hooks/useQuote.ts`
```typescript
// Extract: Quote fetching logic
export function useQuote(lines: Line[], promotionCode: string) {
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  
  // Debounced quote call
  useEffect(() => { ... }, [lines, promotionCode]);
  
  return { quote, quoting };
}
```

#### 1.3 `src/app/pos/hooks/useCustomer.ts`
```typescript
// Extract: Customer lookup & management
export function useCustomer(phone: string) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Debounced lookup
  useEffect(() => { ... }, [phone]);
  
  return { customer, loading, updateCustomer };
}
```

#### 1.4 `src/app/pos/hooks/useAddressAutocomplete.ts`
```typescript
// Extract: Address autocomplete logic
export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Debounced autocomplete
  useEffect(() => { ... }, [query]);
  
  return { suggestions, loading };
}
```

#### 1.5 `src/app/pos/hooks/useOrderLines.ts`
```typescript
// Extract: Order lines management
export function useOrderLines(initialLines: Line[] = [newLine()]) {
  const [lines, setLines] = useState<Line[]>(initialLines);
  
  const updateLine = useCallback(...);
  const removeLine = useCallback(...);
  const addLine = useCallback(...);
  
  return { lines, updateLine, removeLine, addLine };
}
```

#### 1.6 `src/app/pos/hooks/useSugarOptions.ts`
```typescript
// Extract: Sugar options loading & caching
export function useSugarOptions() {
  const [sugarMap, setSugarMap] = useState<Record<string, SugarOption[]>>({});
  
  const fetchSugarOptions = useCallback(async (productId: string) => {
    // Logic here
  }, []);
  
  return { sugarMap, fetchSugarOptions };
}
```

**Impact:**
- ✅ Reduce component size từ 1084 → ~300-400 lines
- ✅ Reusable logic
- ✅ Easier testing
- ✅ Better separation of concerns

---

### Phase 2: Extract Components (HIGH PRIORITY)

#### 2.1 `src/app/pos/components/ProductLine.tsx`
```typescript
// Extract: Single product line row
interface ProductLineProps {
  line: Line;
  product: ProductRow | null;
  quoteLine: QuoteLine | null;
  sugarOptions: SugarOption[] | undefined;
  onUpdate: (patch: Partial<Line>) => void;
  onRemove: () => void;
  loading: boolean;
}
export function ProductLine({ ... }: ProductLineProps) { ... }
```

#### 2.2 `src/app/pos/components/OrderSummary.tsx`
```typescript
// Extract: Right panel - Order summary
interface OrderSummaryProps {
  quote: QuoteResult | null;
  shipping: ShippingInfo;
  totals: Totals;
  // ... other props
}
export function OrderSummary({ ... }: OrderSummaryProps) { ... }
```

#### 2.3 `src/app/pos/components/CustomerForm.tsx`
```typescript
// Extract: Customer information form
interface CustomerFormProps {
  phone: string;
  customerName: string;
  defaultAddress: string;
  onPhoneChange: (phone: string) => void;
  onNameChange: (name: string) => void;
  onAddressChange: (address: string) => void;
}
export function CustomerForm({ ... }: CustomerFormProps) { ... }
```

#### 2.4 `src/app/pos/components/DeliveryForm.tsx`
```typescript
// Extract: Delivery information form
interface DeliveryFormProps {
  platformName: string;
  deliveryTime: string;
  storeName: string;
  note: string;
  // ... onChange handlers
}
export function DeliveryForm({ ... }: DeliveryFormProps) { ... }
```

#### 2.5 `src/app/pos/components/ShippingForm.tsx`
```typescript
// Extract: Shipping fee form
interface ShippingFormProps {
  fee: number;
  discount: number;
  freeShipping: boolean;
  // ... onChange handlers
}
export function ShippingForm({ ... }: ShippingFormProps) { ... }
```

#### 2.6 `src/app/pos/components/AddressAutocomplete.tsx`
```typescript
// Extract: Address autocomplete input
interface AddressAutocompleteProps {
  query: string;
  suggestions: AddressSuggestion[];
  selected: AddressSuggestion | null;
  onQueryChange: (query: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
}
export function AddressAutocomplete({ ... }: AddressAutocompleteProps) { ... }
```

**Impact:**
- ✅ Component size giảm đáng kể
- ✅ Reusable components
- ✅ Easier to test individual parts
- ✅ Better composition

---

### Phase 3: Extract Utilities & Types (MEDIUM PRIORITY)

#### 3.1 `src/app/pos/types/index.ts`
```typescript
// Shared types
export type ProductRow = { ... };
export type Line = { ... };
export type QuoteResult = { ... };
export type Promotion = { ... };
export type SizeKey = "SIZE_PHE" | "SIZE_LA" | "STD";
// ... all types
```

#### 3.2 `src/app/pos/utils/formatters.ts`
```typescript
export function formatMoney(n: number): string { ... }
export function formatPhone(phone: string): string { ... }
// ... other formatters
```

#### 3.3 `src/app/pos/utils/validators.ts`
```typescript
export function isPositiveInt(x: unknown): boolean { ... }
export function safeNumber(x: unknown): number { ... }
export function toNum(x: any): number | null { ... }
// ... other validators
```

#### 3.4 `src/app/pos/utils/calculations.ts`
```typescript
export function calculateShipping(fee: number, discount: number, free: boolean): ShippingCalc { ... }
export function calculateTotals(quote: QuoteResult, shipping: ShippingCalc): Totals { ... }
// ... other calculations
```

#### 3.5 `src/app/pos/utils/messageGenerator.ts`
```typescript
export function generateConfirmationMessage(
  lines: Line[],
  customer: CustomerInfo,
  quote: QuoteResult,
  shipping: ShippingInfo,
  delivery: DeliveryInfo
): string {
  // Extract message generation logic
}
```

**Impact:**
- ✅ Better type safety
- ✅ Reusable utilities
- ✅ Easier to test pure functions
- ✅ Single source of truth cho types

---

### Phase 4: State Management Optimization (MEDIUM PRIORITY)

#### 4.1 Option A: useReducer for Related State
```typescript
// src/app/pos/hooks/useOrderState.ts
type OrderState = {
  customer: CustomerInfo;
  delivery: DeliveryInfo;
  shipping: ShippingInfo;
  lines: Line[];
};

function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case 'UPDATE_CUSTOMER': ...
    case 'UPDATE_DELIVERY': ...
    case 'ADD_LINE': ...
    // ...
  }
}

export function useOrderState() {
  const [state, dispatch] = useReducer(orderReducer, initialState);
  return { state, dispatch };
}
```

#### 4.2 Option B: Custom Hook Grouping
```typescript
// src/app/pos/hooks/useOrderForm.ts
export function useOrderForm() {
  const customer = useCustomer(phone);
  const delivery = useDeliveryInfo();
  const shipping = useShippingInfo();
  
  return {
    customer: { ...customer, ...customerState },
    delivery: { ...delivery, ...deliveryState },
    shipping: { ...shipping, ...shippingState },
  };
}
```

**Recommendation:** Start with Option B (simpler), move to Option A nếu state logic phức tạp hơn.

---

### Phase 5: API Route Optimization (MEDIUM PRIORITY)

#### 5.1 Parallelize Customer + Order Creation (if possible)
```typescript
// In /api/orders/route.ts
// Current: Sequential
// 1. Lookup customer
// 2. Update/create customer
// 3. Create order
// 4. Create order_lines
// 5. Create promotions

// Optimized: Parallelize independent operations
const [customerResult, initialOrderPrep] = await Promise.all([
  upsertCustomer(...),
  prepareOrderData(...),
]);

// Then create order + lines in parallel (nếu supported bởi DB)
const [orderResult, linesResult] = await Promise.all([
  createOrder(...),
  prepareOrderLines(...),
]);
```

**Note:** Cần kiểm tra database constraints - có thể không parallelize được nếu có foreign key dependencies.

---

### Phase 6: Styling Migration (LOW PRIORITY)

#### 6.1 Migrate to Tailwind CSS
```typescript
// Before:
style={{ padding: 8, width: "100%", borderRadius: 6 }}

// After:
className="w-full p-2 rounded-md"
```

**Benefits:**
- ✅ Smaller bundle size
- ✅ Better consistency
- ✅ Easier maintenance
- ✅ Better developer experience

**Approach:**
- Create Tailwind config với custom colors
- Migrate component by component
- Keep inline styles for dynamic values (calculated widths, etc.)

---

## 📋 Implementation Order

### Week 1: Foundation
1. ✅ Create `src/app/pos/types/index.ts` - Shared types
2. ✅ Create `src/app/pos/utils/` - Formatters, validators, calculations
3. ✅ Extract `useProducts` hook
4. ✅ Extract `useQuote` hook

### Week 2: Components
1. ✅ Extract `ProductLine` component
2. ✅ Extract `CustomerForm` component
3. ✅ Extract `DeliveryForm` component
4. ✅ Extract `ShippingForm` component

### Week 3: Advanced Hooks
1. ✅ Extract `useOrderLines` hook
2. ✅ Extract `useCustomer` hook
3. ✅ Extract `useAddressAutocomplete` hook
4. ✅ Extract `useSugarOptions` hook

### Week 4: Integration & Polish
1. ✅ Refactor main `PosPage` to use new hooks/components
2. ✅ Extract `OrderSummary` component
3. ✅ Optimize API routes
4. ✅ Add error boundaries
5. ✅ Testing & bug fixes

---

## 🎯 Success Metrics

### Before Refactor:
- Component size: **1084 lines**
- Number of useState: **20+**
- Reusable code: **Low**
- Testability: **Difficult**
- Maintainability: **Low**

### After Refactor:
- Component size: **~300-400 lines** (70% reduction)
- Number of useState: **Grouped** (useReducer or custom hooks)
- Reusable code: **High** (hooks + components + utils)
- Testability: **Easy** (isolated units)
- Maintainability: **High** (clear separation)

---

## 🔍 Code Quality Improvements

### Type Safety
- ✅ Remove all `any` types
- ✅ Shared type definitions
- ✅ Strict TypeScript

### Performance
- ✅ Memoization with React.memo
- ✅ useMemo for expensive calculations
- ✅ useCallback for event handlers
- ✅ Code splitting (nếu cần)

### Error Handling
- ✅ Error boundaries
- ✅ Consistent error messages
- ✅ User-friendly error UI

### Testing Strategy
- ✅ Unit tests cho utilities
- ✅ Component tests cho UI components
- ✅ Integration tests cho hooks
- ✅ E2E tests cho critical flows

---

## ⚠️ Migration Risks & Mitigation

### Risk 1: Breaking Changes
- **Mitigation:** Refactor incrementally, test after each phase
- **Approach:** Keep old code until new code is verified

### Risk 2: Performance Regression
- **Mitigation:** Benchmark before/after, monitor bundle size
- **Approach:** Use React DevTools Profiler

### Risk 3: State Loss During Refactor
- **Mitigation:** Maintain state structure, migrate carefully
- **Approach:** Test state transitions thoroughly

---

## 📚 References

- [React Best Practices - Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- [Next.js Best Practices](https://nextjs.org/docs)
- [Custom Hooks Pattern](https://react.dev/reference/react/useState)
- [Component Composition](https://react.dev/learn/passing-props-to-a-component)

---

**Estimated Time:** 4 weeks (with 1 developer)
**Priority:** HIGH - Component quá lớn, khó maintain
**Risk Level:** MEDIUM - Cần testing kỹ lưỡng
