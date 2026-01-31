"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

type ProductRow = {
  product_id: string;
  product_code: string;
  name: string;
  category: string | null;
  price_phe: number | null;
  price_la: number | null;
  price_std: number | null;
};

type SizeKey = "SIZE_PHE" | "SIZE_LA" | "STD";

type SugarOption = {
  product_id: string;
  product_code: string;
  value_code: string;
  label: string;
  is_default: boolean;
  sort_order: number;
};

type Line = {
  id: string;
  product_id: string;
  product_name_input: string;
  size: SizeKey;
  sugar_value_code: string;
  qty: number;
  note?: string;
};

type DraftLine = {
  id: string; // uuid
  product_id: string;
  qty: number;
  size: SizeKey;
  sugar_value_code: string;
  note: string;
};

type QuoteLine = {
  line_id: string; // POS line UUID - required to handle duplicate products
  product_id: string;
  qty: number;
  display_price_key?: SizeKey;
  charged_price_key?: SizeKey;
  unit_price_before?: number;
  unit_price_after?: number;
  line_total_before?: number;
  line_total_after?: number;
  adjustments?: { type: "FREE_UPSIZE" | "DISCOUNT" | string; amount: number }[];
  missing_price?: boolean;
};

type QuoteResult = {
  ok: boolean;
  lines: QuoteLine[];
  totals: {
    subtotal_before: number;
    discount_total: number;
    grand_total: number;
  };
  meta?: {
    free_upsize_applied?: boolean;
    discount_percent?: number;
    drink_qty?: number;
  };
  error?: string;
};

function newLine(): Line {
  return {
    id: crypto.randomUUID(),
    product_id: "",
    product_name_input: "",
    size: "STD",
    sugar_value_code: "",
    qty: 1,
  };
}

function formatMoney(n: number) {
  return Math.round(n).toLocaleString();
}

function isPositiveInt(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) && n > 0;
}

function safeNumber(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function money(x: unknown) {
  return Math.round(Math.max(0, safeNumber(x)));
}

function isSizedProduct(p: ProductRow | null) {
  return !!p && p.price_phe != null && p.price_la != null;
}

// Normalize Vietnamese text for search (remove diacritics, lowercase)
function normalizeVietnamese(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
}

// ChipGroup Component - radio group styled as chips/pills
type ChipGroupOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ChipGroupProps = {
  value: string;
  options: ChipGroupOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onInteract?: () => void; // Called on mouse enter or focus
  compact?: boolean; // Use horizontal scroll instead of wrap
};

function ChipGroup({ value, options, onChange, disabled, onInteract, compact }: ChipGroupProps) {
  return (
    <div
      role="radiogroup"
      onMouseEnter={onInteract}
      onFocus={onInteract}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        width: "100%",
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const isDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(opt.value)}
            style={{
              padding: "6px 12px",
              border: isSelected ? "2px solid #3b82f6" : "1px solid #666",
              borderRadius: 16,
              background: isSelected ? "#3b82f6" : isDisabled ? "#1a1a1a" : "#2a2a2a",
              color: isDisabled ? "#555" : isSelected ? "#fff" : "#ddd",
              cursor: isDisabled ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: isSelected ? 600 : 400,
              transition: "all 0.15s ease",
              opacity: isDisabled ? 0.4 : 1,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!isDisabled && !isSelected) {
                e.currentTarget.style.background = "#3a3a3a";
                e.currentTarget.style.borderColor = "#888";
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled && !isSelected) {
                e.currentTarget.style.background = "#2a2a2a";
                e.currentTarget.style.borderColor = "#666";
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), text };
  } catch {
    return { ok: false, status: res.status, json: null as any, text };
  }
}

export default function PosPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error || !data.session) {
          router.replace(`/login?redirect=${encodeURIComponent("/pos")}`);
          return;
        }
        setCheckingAuth(false);
      } catch {
        router.replace(`/login?redirect=${encodeURIComponent("/pos")}`);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  const [products, setProducts] = useState<ProductRow[]>([]);
  // Lazy state initialization: only create initial line once
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [sugarMap, setSugarMap] = useState<Record<string, SugarOption[]>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [promotions, setPromotions] = useState<any[]>([]);
  const [promotionCode, setPromotionCode] = useState<string>("");

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);

  const [platformName, setPlatformName] = useState<string>("Grab");
  const [deliveryTime, setDeliveryTime] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("Phê La Hồ Tùng Mậu");
  const [storeId, setStoreId] = useState<string>("");
  const [storeSuggestions, setStoreSuggestions] = useState<any[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string>("");
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [autoSelectedStore, setAutoSelectedStore] = useState(false);
  const [note, setNote] = useState<string>("");

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [defaultAddress, setDefaultAddress] = useState("");

  const [addrQuery, setAddrQuery] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<any[]>([]);
  const [selectedAddr, setSelectedAddr] = useState<any | null>(null);
  const [addrSessionToken, setAddrSessionToken] = useState<string>("");

  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  const [shippingFee, setShippingFee] = useState<number>(0);
  const [freeShipping, setFreeShipping] = useState<boolean>(false);
  const [shippingDiscount, setShippingDiscount] = useState<number>(0);

  const [creatingOrder, setCreatingOrder] = useState(false);

  // Product Picker Modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [modalCategory, setModalCategory] = useState<string>("DRINK");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [editLineId, setEditLineId] = useState<string | null>(null);

  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressCustomerSearchRef = useRef<boolean>(false);
  const suppressAddrSearchRef = useRef<boolean>(false);

  // Fetch nearest stores when address is selected
  useEffect(() => {
    if (!selectedAddr) {
      return;
    }

    // Extract lat/lng from selected address
    const lat = selectedAddr.lat ?? selectedAddr.raw?.location?.latitude ?? selectedAddr.raw?.geometry?.location?.lat;
    const lng = selectedAddr.lng ?? selectedAddr.lon ?? selectedAddr.raw?.location?.longitude ?? selectedAddr.raw?.geometry?.location?.lng;

    console.debug('[POS] Nearest store: selectedAddr changed', { lat, lng, selectedAddr });

    if (!lat || !lng) {
      setStoreError("Không tìm được tọa độ địa chỉ");
      return;
    }

    // Debug logging in development
    if (process.env.NODE_ENV !== "production") {
      console.debug("nearest-store coords", { lat, lng });
    }

    const controller = new AbortController();
    let isLatest = true;

    (async () => {
      setStoreLoading(true);
      setStoreError("");
      
      try {
        const res = await fetch(
          `/api/stores/nearest?lat=${lat}&lng=${lng}&limit=5`,
          { signal: controller.signal }
        );
        const data = await res.json();
        
        if (!isLatest) return;
        
        if (data.ok && data.items?.length > 0) {
          setStoreSuggestions(data.items);
          
          // Auto-select nearest store (first in list)
          const nearest = data.items[0];
          setStoreId(nearest.id);
          setStoreName(nearest.name);
          setAutoSelectedStore(true);
        } else if (data.error?.includes("Invalid")) {
          // Invalid coords - suppress dropdown
          setStoreError("");
          setStoreSuggestions([]);
        } else if (data.error === "MISSING_LAT_LNG") {
          setStoreError("Thiếu tọa độ địa chỉ");
        } else {
          setStoreError("Không tìm được cơ sở gần nhất");
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (!isLatest) return;
        console.error("Nearest stores fetch error:", err);
        setStoreError("Lỗi khi tìm cơ sở");
      } finally {
        if (isLatest) {
          setStoreLoading(false);
        }
      }
    })();

    return () => {
      isLatest = false;
      controller.abort();
    };
  }, [selectedAddr]);

  // Load products and promotions in parallel (eliminate waterfall)
  useEffect(() => {
    async function loadInitialData() {
      setLoadingProducts(true);
      
      // Parallelize independent async operations
      const [productsResult, promotionsResult] = await Promise.all([
        supabase.from("v_products_menu").select("*").order("name"),
        supabase
          .from("promotions")
          .select("code,name,promo_type,percent_off,min_qty,priority,is_stackable,is_active")
          .eq("is_active", true)
          .order("priority", { ascending: true })
          .order("promo_type", { ascending: true })
          .order("percent_off", { ascending: true }),
      ]);

      // Handle products
      if (productsResult.error) {
        console.error("Load products error:", productsResult.error.message);
        setProducts([]);
      } else {
        setProducts((productsResult.data ?? []) as ProductRow[]);
      }

      // Handle promotions
      if (promotionsResult.error) {
        console.error("Load promotions error:", promotionsResult.error.message);
        setPromotions([]);
      } else {
        setPromotions(promotionsResult.data ?? []);
      }

      setLoadingProducts(false);
    }
    loadInitialData();
  }, []);

  // productById
  const productById = useMemo(() => {
    const m = new Map<string, ProductRow>();
    products.forEach((p) => m.set(p.product_id, p));
    return m;
  }, [products]);

  // Fetch customer by phone
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) return;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?phone=${encodeURIComponent(digits)}`);
        const { ok, json } = await safeReadJson(res);
        if (ok && json?.customer) {
          setCustomerName(json.customer.customer_name || "");
          setDefaultAddress(json.customer.default_address || "");
          setAddrQuery((prev) => (prev.trim() ? prev : json.customer.default_address || ""));
        }
      } catch (e) {
        console.error("Fetch customer error:", e);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [phone]);

  // Google Places autocomplete with session token
  useEffect(() => {
    const q = addrQuery.trim();
    if (q.length < 3) {
      setAddrSuggestions([]);
      return;
    }

    // Skip search if suppressed (after selection)
    if (suppressAddrSearchRef.current) {
      console.debug('[POS] Autocomplete: suppressed after selection');
      suppressAddrSearchRef.current = false;
      return;
    }

    // Generate session token if not exists
    if (!addrSessionToken) {
      const newToken = crypto.randomUUID();
      console.debug('[POS] Autocomplete: generated new session token', newToken);
      setAddrSessionToken(newToken);
    }

    const abortController = new AbortController();
    let isLatest = true;

    const t = setTimeout(async () => {
      try {
        const url = `/api/places/autocomplete?q=${encodeURIComponent(q)}${addrSessionToken ? `&sessionToken=${encodeURIComponent(addrSessionToken)}` : ""}&limit=6`;
        console.debug('[POS] Autocomplete: fetching', { query: q, sessionToken: addrSessionToken });
        
        const res = await fetch(url, {
          method: "GET",
          signal: abortController.signal,
        });

        if (!isLatest) return;

        const { ok, json } = await safeReadJson(res);
        if (ok && json?.items) {
          console.debug('[POS] Autocomplete: received suggestions', json.items.length);
          setAddrSuggestions(json.items);
        } else {
          console.debug('[POS] Autocomplete: no suggestions');
          setAddrSuggestions([]);
        }
      } catch (e: any) {
        if (e.name === "AbortError") return;
        if (!isLatest) return;
        console.error('[POS] Autocomplete: error', e);
        setAddrSuggestions([]);
      }
    }, 250);

    return () => {
      isLatest = false;
      clearTimeout(t);
      abortController.abort();
    };
  }, [addrQuery, addrSessionToken]);

  // Customer autocomplete by phone or name
  useEffect(() => {
    const q = phone.trim();
    if (q.length < 3) {
      setCustomerSuggestions([]);
      setCustomerDropdownOpen(false);
      return;
    }

    // Skip search if suppressed (after selection)
    if (suppressCustomerSearchRef.current) {
      suppressCustomerSearchRef.current = false;
      return;
    }

    const abortController = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}&limit=8`, {
          signal: abortController.signal,
        });
        const { ok, json } = await safeReadJson(res);
        if (ok && json?.items) {
          setCustomerSuggestions(json.items);
          setCustomerDropdownOpen(json.items.length > 0);
        } else {
          setCustomerSuggestions([]);
          setCustomerDropdownOpen(false);
        }
      } catch (e: any) {
        if (e.name === "AbortError") return;
        setCustomerSuggestions([]);
        setCustomerDropdownOpen(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      abortController.abort();
    };
  }, [phone]);

  // Quote payload - include line_id to handle duplicate products
  // Optimized: single iteration instead of filter().map() (React Best Practice 7.6)
  const quoteLines = useMemo(() => {
    const result = [];
    for (const l of lines) {
      if (l.product_id && isPositiveInt(l.qty)) {
        result.push({
          line_id: l.id, // Use POS line UUID for mapping quote results
          product_id: l.product_id,
          qty: Number(l.qty),
          price_key: l.size,
          options: { sugar: l.sugar_value_code || "" },
        });
      }
    }
    return result;
  }, [lines]);

  // Debounced quote call with AbortController (BUSINESS RULE D: prevent stale responses)
  useEffect(() => {
    if (quoteLines.length === 0) {
      setQuote(null);
      return;
    }

    const abortController = new AbortController();
    let isLatest = true; // Prevent stale/out-of-order responses

    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promotion_code: promotionCode || null,
            lines: quoteLines,
          }),
          signal: abortController.signal,
        });

        // CRITICAL: Only update state if this is still the latest request
        if (!isLatest) return;

        const text = await res.text();
        let json: QuoteResult | null = null;
        try {
          json = JSON.parse(text);
        } catch {}

        // Double check still latest before updating state
        if (!isLatest) return;

        if (!res.ok || !json?.ok) {
          setQuote({
            ok: false,
            lines: [],
            totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
            error: json?.error || "Quote failed",
          });
        } else {
          setQuote(json);
        }
      } catch (e: any) {
        // Ignore AbortError (expected when request is cancelled)
        if (e.name === "AbortError") return;

        // Only update state if still latest
        if (!isLatest) return;

        setQuote({
          ok: false,
          lines: [],
          totals: { subtotal_before: 0, discount_total: 0, grand_total: 0 },
          error: "Quote error",
        });
      } finally {
        if (isLatest) {
          setQuoting(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      isLatest = false; // Mark as stale
      abortController.abort(); // Cancel in-flight request
    };
  }, [quoteLines, promotionCode]);

  // BUSINESS RULE C: Map quote results by line_id (not product_id)
  // This fixes the duplicate product bug where 2 lines of same product overwrite each other
  const quoteLineMap = useMemo(() => {
    const m = new Map<string, QuoteLine>();
    quote?.lines?.forEach((ql) => m.set(ql.line_id, ql));
    return m;
  }, [quote]);

  // REMOVED: Auto-change SIZE_PHE -> SIZE_LA effect
  // Reason: Caused feedback loop - changing size triggers new quote that doesn't qualify
  // Solution: Display ql.display_price_key in UI, keep line.size as user's original selection

  // Tính tổng số lượng (itemTotals) - THÊM LẠI ĐỂ FIX LỖI
  const itemTotals = useMemo(() => {
    let totalQty = 0;
    for (const l of lines) {
      if (!l.product_id || !isPositiveInt(l.qty)) continue;
      totalQty += Number(l.qty);
    }
    return { totalQty };
  }, [lines]);

  const hasMissingPrice = useMemo(() => quote?.lines?.some((x) => x.missing_price) ?? false, [quote]);

  const itemsSubtotalBefore = quote?.ok ? quote.totals.subtotal_before : 0;
  const itemsDiscount = quote?.ok ? quote.totals.discount_total : 0;
  const itemsPay = quote?.ok ? quote.totals.grand_total : 0;

  const shipping = useMemo(() => {
    const fee = Math.max(0, Math.round(safeNumber(shippingFee)));
    const disc = Math.max(0, Math.round(safeNumber(shippingDiscount)));
    if (freeShipping) return { fee, discount: fee, pay: 0 };
    const pay = Math.max(0, fee - disc);
    return { fee, discount: Math.min(disc, fee), pay };
  }, [shippingFee, shippingDiscount, freeShipping]);

  const grandTotal = Math.max(0, itemsPay + shipping.pay);

  function updateLine(lineId: string, patch: Partial<Line>) {
    // Use functional update to prevent stale closures (React Best Practice 5.5)
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  }

  function removeLine(lineId: string) {
    // Use functional update to prevent stale closures (React Best Practice 5.5)
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId)));
  }

  function getAvailableSizes(p: ProductRow | null): SizeKey[] {
    if (!p) return ["STD"];
    const sizes: SizeKey[] = [];
    if (p.price_phe != null) sizes.push("SIZE_PHE");
    if (p.price_la != null) sizes.push("SIZE_LA");
    if (p.price_std != null) sizes.push("STD");
    return sizes.length ? sizes : ["STD"];
  }

  // Product Picker Modal helpers
  const categoryList = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    const sorted = Array.from(cats).sort();
    const order: string[] = [];
    if (sorted.includes("DRINK")) order.push("DRINK");
    if (sorted.includes("CAKE")) order.push("CAKE");
    sorted.forEach((c) => {
      if (c !== "DRINK" && c !== "CAKE") order.push(c);
    });
    order.push("ALL");
    return order;
  }, [products]);

  const categoryLabel = (cat: string) => {
    if (cat === "ALL") return "Tất cả";
    if (cat === "DRINK") return "Đồ uống";
    if (cat === "CAKE") return "Bánh";
    return cat;
  };

  function openProductModal(lineToEdit?: Line) {
    setShowProductModal(true);
    setModalSearchQuery("");
    
    if (lineToEdit && lineToEdit.product_id) {
      // EDIT mode: prefill one draft from existing line
      const product = productById.get(lineToEdit.product_id);
      const category = product?.category?.includes("DRINK") ? "DRINK" : product?.category?.includes("CAKE") ? "CAKE" : "ALL";
      setModalCategory(category);
      setEditLineId(lineToEdit.id);
      
      const draft: DraftLine = {
        id: crypto.randomUUID(),
        product_id: lineToEdit.product_id,
        qty: lineToEdit.qty,
        size: lineToEdit.size,
        sugar_value_code: lineToEdit.sugar_value_code,
        note: lineToEdit.note || "",
      };
      setDraftLines([draft]);
      
      // Ensure sugar options loaded for DRINK
      if (product?.category?.includes("DRINK")) {
        ensureSugarOptions(lineToEdit.product_id);
      }
    } else {
      // ADD mode: start fresh
      setModalCategory("DRINK");
      setEditLineId(null);
      setDraftLines([]);
    }
  }

  function closeProductModal() {
    setShowProductModal(false);
    setDraftLines([]);
    setEditLineId(null);
  }

  function addProductToDraft(product: ProductRow) {
    const avail = getAvailableSizes(product);
    const defaultSize = avail[0] ?? "STD";
    
    const newDraft: DraftLine = {
      id: crypto.randomUUID(),
      product_id: product.product_id,
      qty: 1,
      size: defaultSize,
      sugar_value_code: "",
      note: "",
    };
    
    setDraftLines((prev) => [...prev, newDraft]);
    
    // Fetch default sugar if DRINK
    if (product.category?.includes("DRINK")) {
      fetchSugarOptions(product.product_id).then((opts) => {
        const def = opts.find((o) => o.is_default) ?? opts[0];
        if (def) {
          setDraftLines((prev) =>
            prev.map((d) => (d.id === newDraft.id ? { ...d, sugar_value_code: def.value_code } : d))
          );
        }
      });
    }
  }

  function updateDraftLine(draftId: string, updates: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((d) => (d.id === draftId ? { ...d, ...updates } : d)));
  }

  function removeDraftLine(draftId: string) {
    setDraftLines((prev) => prev.filter((d) => d.id !== draftId));
  }

  async function addDraftLinesToOrder() {
    if (editLineId) {
      // EDIT mode: update existing line
      const draft = draftLines[0];
      if (draft) {
        const product = productById.get(draft.product_id);
        setLines((prev) =>
          prev.map((l) =>
            l.id === editLineId
              ? {
                  ...l,
                  product_id: draft.product_id,
                  product_name_input: product?.name ?? "",
                  size: draft.size,
                  sugar_value_code: draft.sugar_value_code,
                  qty: draft.qty,
                  note: draft.note,
                }
              : l
          )
        );
      }
    } else {
      // ADD mode: add new lines
      const itemsToAdd: Line[] = draftLines.map((draft) => {
        const product = productById.get(draft.product_id);
        return {
          id: draft.id,
          product_id: draft.product_id,
          product_name_input: product?.name ?? "",
          size: draft.size,
          sugar_value_code: draft.sugar_value_code,
          qty: draft.qty,
          note: draft.note,
        };
      });
      
      if (itemsToAdd.length > 0) {
        setLines((prev) => {
          const lastLine = prev[prev.length - 1];
          const hasEmptyTrailing = lastLine && !lastLine.product_id && !lastLine.product_name_input;
          
          if (hasEmptyTrailing) {
            return [...prev.slice(0, -1), ...itemsToAdd, lastLine];
          } else {
            return [...prev, ...itemsToAdd];
          }
        });
      }
    }
    
    closeProductModal();
  }

  async function ensureSugarOptions(productId: string) {
    // Use functional update to prevent stale closures (React Best Practice 5.5)
    if (!productId || sugarMap[productId]) return;
    const { data, error } = await supabase
      .from("v_product_sugar_options")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    if (error) {
      setSugarMap((curr) => ({ ...curr, [productId]: [] }));
      return;
    }
    setSugarMap((curr) => ({ ...curr, [productId]: data as SugarOption[] }));
  }

  async function fetchSugarOptions(productId: string): Promise<SugarOption[]> {
    // Use functional update to prevent stale closures (React Best Practice 5.5)
    const { data, error } = await supabase
      .from("v_product_sugar_options")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    if (error) {
      setSugarMap((curr) => ({ ...curr, [productId]: [] }));
      return [];
    }
    const opts = data as SugarOption[];
    setSugarMap((curr) => ({ ...curr, [productId]: opts }));
    return opts;
  }

  // Auto-add empty line - uses functional update (React Best Practice 5.5)
  useEffect(() => {
    setLines((curr) => {
      if (curr.length === 0) return curr;
      const last = curr[curr.length - 1];
      if (!last.product_id || !isPositiveInt(last.qty)) return curr;
      const hasEmptyTail = curr.length >= 2 && !curr[curr.length - 1].product_id && !curr[curr.length - 1].product_name_input;
      if (hasEmptyTail) return curr;
      return [...curr, newLine()];
    });
  }, [lines.map((l) => `${l.id}|${l.product_id}|${l.qty}`).join("||")]);

  function sugarLabelForLine(l: Line): string {
    if (!l.product_id) return "";
    const opts = sugarMap[l.product_id];
    if (!opts?.length) return "";
    return opts.find((o) => o.value_code === l.sugar_value_code)?.label ?? "";
  }

  const confirmationMessage = useMemo(() => {
    // Optimized: single iteration instead of filter().map() (React Best Practice 7.6)
    const usedLines = [];
    for (const l of lines) {
      if (l.product_id && isPositiveInt(l.qty)) {
        const p = productById.get(l.product_id);
        const name = p?.name ?? l.product_name_input ?? "(Chưa chọn món)";
        const sugar = sugarLabelForLine(l);
        const qtyStr = String(l.qty).padStart(2, "0");

        const ql = quoteLineMap.get(l.id);
        const hasFreeUpsize = !!ql?.adjustments?.some((a) => a.type === "FREE_UPSIZE" && a.amount > 0);

        usedLines.push(`${qtyStr} ${name}${sugar ? ` ${sugar}` : ""}${hasFreeUpsize ? " - Miễn phí upsize La" : ""}`);
      }
    }

    const header = "Phê La xin xác nhận đơn hàng của bạn như sau:";
    const info = [
      `- Thông tin giao hàng: ${platformName}${addrQuery ? ` - ${addrQuery}` : ""}${deliveryTime ? `\n${deliveryTime} giao` : ""}`,
      storeName ? `- Cơ sở thực hiện: ${storeName}` : "",
      note ? `- Ghi chú: ${note}` : "",
    ].filter(Boolean).join("\n");

    const itemsText = usedLines.length ? usedLines.join("\n") : "(Chưa có món)";

    const pricingText = [
      `- Tiền món: ${formatMoney(itemsPay)}`,
      `- Phí ship: ${formatMoney(shipping.fee)}`,
      shipping.discount > 0 ? `- Giảm ship: ${formatMoney(shipping.discount)}` : "",
      `- Tổng hoá đơn: ${formatMoney(grandTotal)}`,
    ].filter(Boolean).join("\n");

    const vat = "*** Trường hợp cần xuất hoá đơn VAT nhờ bạn cung cấp giúp Phê La. Thông tin sẽ được ghi nhận trong vòng 2 tiếng kể từ khi đơn hàng được xuất thành công trên hệ thống";

    return [header, info, "", "- Thông tin món:", itemsText, "", pricingText, "", "Nhờ bạn xác nhận thông tin đơn hàng giúp Phê La nhé, cảm ơn bạn", vat]
      .filter(Boolean)
      .join("\n");
  }, [lines, productById, sugarMap, quoteLineMap, platformName, addrQuery, deliveryTime, storeName, note, itemsPay, shipping, grandTotal]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(confirmationMessage);
      alert("Đã copy tin nhắn xác nhận ✅");
    } catch {
      messageRef.current?.select();
      document.execCommand("copy");
      alert("Đã copy tin nhắn xác nhận ✅");
    }
  }

  async function onCreateOrder() {
    // Early returns for validation (React Best Practice 7.8)
    if (creatingOrder) return;
    if (!quote?.ok) {
      alert(`Chưa thể đặt đơn: quote lỗi (${quote?.error || "unknown"})`);
      return;
    }
    if (hasMissingPrice) {
      alert("Chưa thể đặt đơn: có món thiếu giá.");
      return;
    }

    const digits = phone.replace(/\D/g, "");
    
    // BUSINESS RULE C & B: Use line_id for quote lookup, send display_size + price_key to server
    const payloadLines = [];
    for (const l of lines) {
      if (!l.product_id || !isPositiveInt(l.qty)) continue;
      
      const p = productById.get(l.product_id);
      const ql = quoteLineMap.get(l.id); // CRITICAL: lookup by line_id for duplicate products

      // BUSINESS RULE B: For free upsize, display_size = LA (from quote.display_price_key)
      // but price_key = PHE (what server charges, from quote.charged_price_key)
      const displaySize = (ql?.display_price_key ?? l.size) as SizeKey; // LA for upsize
      const priceKey = (ql?.charged_price_key ?? l.size) as SizeKey; // PHE for upsize

      payloadLines.push({
        line_id: l.id, // UUID for server-side quote lookup
        product_id: l.product_id,
        qty: Number(l.qty),
        display_size: displaySize, // What customer sees (LA for free upsize)
        price_key: priceKey, // For server pricing calc (PHE for free upsize)
        sugar_value_code: l.sugar_value_code || "",
        product_name_snapshot: p?.name ?? l.product_name_input ?? "",
        note: l.note || "",
      });
    }
    
    if (!payloadLines.length) {
      alert("Chưa có món để đặt đơn.");
      return;
    }
    
    setCreatingOrder(true);
    try {
      // Build clean note (only user note, no platform/store/shipping)
      const cleanNote = note.trim() || "";

      const body = {
        phone: digits,
        customer_name: customerName,
        default_address: defaultAddress,
        addr_selected: selectedAddr, // { place_id, display_name, full_address, lat, lng }
        note: cleanNote,
        delivery_time: deliveryTime,
        platform: platformName,
        store_id: storeId || null,
        store_name: storeName,
        promotion_code: promotionCode || null,
        shipping: {
          fee: shipping.fee,
          discount: shipping.discount,
          free: freeShipping,
        },
        lines: payloadLines,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const { ok, json } = await safeReadJson(res);
      if (!ok || !json?.ok) {
        alert(`Tạo đơn thất bại: ${json?.error || "Unknown"}`);
        return;
      }

      alert(`✅ Tạo đơn thành công!\nOrder ID: ${json.order?.id || ""}\nOrder code: ${json.order?.order_code || ""}`);

      setLines([newLine()]);
      setPromotionCode("");
      setQuote(null);
      setShippingFee(0);
      setShippingDiscount(0);
      setFreeShipping(false);
      setNote("");
      setAddrSuggestions([]);
      setSelectedAddr(null);
    } catch (e: any) {
      alert(`Tạo đơn thất bại: ${e.message || "Unknown error"}`);
    } finally {
      setCreatingOrder(false);
    }
  }

  const hasAnyDiscount = itemsDiscount > 0 && itemsSubtotalBefore > itemsPay;

  if (checkingAuth) return <main style={{ padding: 24 }}>Checking session...</main>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 12 }}>POS</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        {/* LEFT */}
        <div>
          <div style={{ border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2.2fr 1fr 1.2fr 0.8fr 1.3fr 40px",
                background: "#111",
                padding: 10,
                fontWeight: 600,
              }}
            >
              <div>Món</div>
              <div>Size</div>
              <div>Đường</div>
              <div style={{ textAlign: "right" }}>SL</div>
              <div style={{ textAlign: "right" }}>Thành tiền</div>
              <div />
            </div>

            {lines.map((l) => {
              const p = productById.get(l.product_id) ?? null;
              const sugarOptions = l.product_id ? sugarMap[l.product_id] : undefined;
              const qty = isPositiveInt(l.qty) ? Number(l.qty) : 0;

              const availableSizes = getAvailableSizes(p);
              const sizeDisabled = !l.product_id || availableSizes.length <= 1;

              const ql = l.product_id ? quoteLineMap.get(l.id) : null;
              const hasPrice = !!ql && !ql.missing_price && ql.line_total_after != null && ql.line_total_before != null;

              const finalLineTotal = ql?.line_total_after ?? null;
              const originalLineTotal = ql?.line_total_before ?? null;
              const showStrike = hasPrice && originalLineTotal! > finalLineTotal!;
              const saving = showStrike ? originalLineTotal! - finalLineTotal! : 0;

              const hasFreeUpsize = !!ql?.adjustments?.some((a) => a.type === "FREE_UPSIZE" && (a.amount ?? 0) > 0);
              const hasDiscount = !!ql?.adjustments?.some((a) => a.type === "DISCOUNT" && (a.amount ?? 0) > 0);

              return (
                <div
                  key={l.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.2fr 1fr 1.2fr 0.8fr 1.3fr 40px",
                    padding: 10,
                    borderTop: "1px solid #222",
                    alignItems: "center",
                    gap: 10,
                    background: (!hasPrice && l.product_id && qty > 0) || quoting ? "rgba(239,68,68,0.08)" : "transparent",
                  }}
                >
                  {/* Product */}
                  <div>
                    {l.product_id ? (
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>{l.product_name_input || p?.name}</div>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                          {hasPrice && ql?.unit_price_after != null
                            ? `${formatMoney(ql.unit_price_after)}đ`
                            : p
                            ? (() => {
                                const prices = [p.price_phe, p.price_la, p.price_std].filter((x) => x != null && x > 0);
                                return prices.length > 0 ? `${formatMoney(Math.min(...(prices as number[])))}đ` : "—";
                              })()
                            : "—"}
                          {p?.product_code && (
                            <span style={{ marginLeft: 6, color: "#666", fontSize: 10 }}>({p.product_code})</span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Ghi chú..."
                          value={l.note || ""}
                          onChange={(e) => updateLine(l.id, { note: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            border: "1px solid #444",
                            borderRadius: 4,
                            background: "#0a0a0a",
                            color: "#aaa",
                            fontSize: 11,
                          }}
                        />
                        {hasFreeUpsize && <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 2 }}>• Upsize</div>}
                        {hasDiscount && <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>• Discount</div>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openProductModal()}
                        style={{
                          padding: 8,
                          width: "100%",
                          border: "1px dashed #666",
                          borderRadius: 4,
                          background: "transparent",
                          color: "#888",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        + Thêm món
                      </button>
                    )}

                    {!hasPrice && l.product_id && qty > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#fca5a5" }}>
                        ❗ Quote báo thiếu giá cho line này. Kiểm tra <code>product_prices</code> / quote API.
                      </div>
                    )}
                  </div>

                  {/* Size */}
                  <div>
                    {l.product_id && availableSizes.length > 1 ? (
                      <div
                        onClick={() => openProductModal(l)}
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          border: "1px solid #666",
                          borderRadius: 4,
                          background: "#2a2a2a",
                          color: "#ddd",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {(() => {
                          const displaySize = ql?.display_price_key ?? l.size;
                          return displaySize === "SIZE_PHE" ? "Phê" : displaySize === "SIZE_LA" ? "La" : "STD";
                        })()}
                      </div>
                    ) : (
                      <span style={{ color: "#666" }}>—</span>
                    )}
                  </div>

                  {/* Sugar */}
                  <div>
                    {l.product_id && p?.category?.includes("DRINK") ? (
                      <div
                        onClick={() => openProductModal(l)}
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          border: "1px solid #666",
                          borderRadius: 4,
                          background: "#2a2a2a",
                          color: "#ddd",
                          fontSize: 12,
                          cursor: "pointer",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sugarOptions?.find((o) => o.value_code === l.sugar_value_code)?.label
                          .replace(/\s*đường\s*$/i, "")
                          .replace(/^Độ ngọt bình thường$/i, "Bình thường") || l.sugar_value_code || "—"}
                      </div>
                    ) : (
                      <span style={{ color: "#666" }}>—</span>
                    )}
                  </div>

                  {/* Qty */}
                  <input
                    type="number"
                    min={1}
                    style={{ padding: 8, width: "100%", textAlign: "right" }}
                    value={l.qty}
                    onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                  />

                  {/* Line total */}
                  <div style={{ textAlign: "right" }}>
                    {!hasPrice ? (
                      <span style={{ fontWeight: 900 }}>--</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
                        <div style={{ fontWeight: 900 }}>{formatMoney(finalLineTotal!)}</div>
                        {showStrike && (
                          <div style={{ fontSize: 12, opacity: 0.78, display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ textDecoration: "line-through" }}>{formatMoney(originalLineTotal!)}</span>
                            <span>giảm {formatMoney(saving)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeLine(l.id)}
                    title="Remove"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #444",
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: 10, opacity: 0.7 }}>
            Nếu dropdown “Đường” hiện “(chưa config đường)” nghĩa là món đó chưa có mapping trong{" "}
            <code>product_option_values</code> (group_code = sugar).
          </p>
        </div>

        {/* RIGHT */}
        <div style={{ border: "1px solid #333", borderRadius: 8, padding: 16, height: "fit-content" }}>
          <h3 style={{ marginTop: 0 }}>Xác nhận đơn</h3>

          {/* Customer */}
          <div style={{ marginBottom: 12, padding: 10, border: "1px solid #222", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Khách hàng</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Số điện thoại</div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setCustomerDropdownOpen(false), 200);
                  }}
                  onFocus={() => {
                    if (customerSuggestions.length > 0) {
                      setCustomerDropdownOpen(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCustomerDropdownOpen(false);
                    }
                  }}
                  placeholder="VD: 0377538625"
                  style={{ padding: 8, width: "100%" }}
                />

                {customerDropdownOpen && customerSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      border: "1px solid #222",
                      borderRadius: 10,
                      background: "#0b0b0b",
                      marginTop: 6,
                      overflow: "hidden",
                      maxHeight: 300,
                      overflowY: "auto",
                    }}
                  >
                    {customerSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          // Clear suggestions and close dropdown FIRST
                          setCustomerSuggestions([]);
                          setCustomerDropdownOpen(false);
                          suppressCustomerSearchRef.current = true;
                          
                          // Then set values
                          setPhone(item.phone_number || "");
                          setCustomerName(item.customer_name || "");
                          setDefaultAddress(item.default_address || "");
                          if (!addrQuery.trim() && item.default_address) {
                            setAddrQuery(item.default_address);
                          }
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 10px",
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          borderBottom: "1px solid #181818",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#1a1a1a";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          {item.customer_name || "(Không có tên)"}
                        </div>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                          {item.phone_number}
                        </div>
                        {item.default_address && (
                          <div style={{ fontSize: 11, color: "#666" }}>
                            {item.default_address}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Tên khách hàng</div>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Tên khách"
                  style={{ padding: 8, width: "100%" }}
                />
              </div>

              <div>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Địa chỉ (mặc định)</div>
                <textarea
                  value={defaultAddress}
                  onChange={(e) => setDefaultAddress(e.target.value)}
                  placeholder="Địa chỉ"
                  style={{ padding: 8, width: "100%", minHeight: 56 }}
                />
              </div>
            </div>
          </div>

          {/* Delivery address */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <div style={{ marginBottom: 6, opacity: 0.8 }}>Địa chỉ giao</div>
            <input
              value={addrQuery}
              onChange={(e) => {
                const v = e.target.value;
                setAddrQuery(v);
                setSelectedAddr(null);
              }}
              style={{ padding: 8, width: "100%" }}
              placeholder="Gõ địa chỉ..."
            />

            {addrSuggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  border: "1px solid #222",
                  borderRadius: 10,
                  background: "#0b0b0b",
                  marginTop: 6,
                  overflow: "hidden",
                }}
              >
                {addrSuggestions.map((it) => (
                  <button
                    key={`${it.place_id ?? ""}-${it.display_name ?? ""}`}
                    type="button"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      console.debug('[POS] Address selected:', { place_id: it.place_id, display_name: it.display_name });
                      
                      // Clear suggestions and suppress FIRST
                      setAddrSuggestions([]);
                      suppressAddrSearchRef.current = true;
                      
                      // Fetch place details to enrich data
                      try {
                        if (it.place_id) {
                          const url = `/api/places/details?placeId=${encodeURIComponent(it.place_id)}` +
                            (addrSessionToken ? `&sessionToken=${encodeURIComponent(addrSessionToken)}` : "");
                          console.debug('[POS] Fetching place details:', { url, sessionToken: addrSessionToken });
                          
                          const res = await fetch(url);
                          const { ok, json } = await safeReadJson(res);
                          if (ok && json) {
                            // Use enriched data with lat/lon/address
                            console.debug('[POS] Place details received:', json);
                            setSelectedAddr(json);
                            setAddrQuery(json.display_name || it.display_name || "");
                          } else {
                            console.warn('[POS] Place details failed, using autocomplete data');
                            // Fallback to autocomplete data
                            setSelectedAddr(it);
                            setAddrQuery(it.display_name || "");
                          }
                        } else {
                          console.warn('[POS] No place_id, using autocomplete data as-is');
                          // No place_id, use as-is
                          setSelectedAddr(it);
                          setAddrQuery(it.display_name || "");
                        }
                      } catch (err) {
                        console.error("[POS] Place details fetch error:", err);
                        // Fallback to autocomplete data
                        setSelectedAddr(it);
                        setAddrQuery(it.display_name || "");
                      }
                      
                      // Reset session token after selection
                      console.debug('[POS] Resetting session token after selection');
                      setAddrSessionToken("");
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 10px",
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {it.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delivery + store */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ marginBottom: 6, opacity: 0.8 }}>Nền tảng</div>
              <input value={platformName} onChange={(e) => setPlatformName(e.target.value)} style={{ padding: 8, width: "100%" }} />
            </div>

            <div>
              <div style={{ marginBottom: 6, opacity: 0.8 }}>Giờ giao</div>
              <input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={{ padding: 8, width: "100%" }} />
            </div>

            <div style={{ position: "relative" }}>
              <div style={{ marginBottom: 6, opacity: 0.8 }}>Cơ sở thực hiện</div>
              <input
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  setAutoSelectedStore(false);
                }}
                onFocus={() => {
                  if (storeSuggestions.length > 0) {
                    setStoreDropdownOpen(true);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setStoreDropdownOpen(false), 200);
                }}
                style={{ padding: 8, width: "100%" }}
              />
              {storeLoading && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Đang tìm cơ sở gần nhất...</div>
              )}
              {storeError && (
                <div style={{ fontSize: 12, color: "#f44", marginTop: 4 }}>{storeError}</div>
              )}
              {autoSelectedStore && storeSuggestions.length > 0 && (
                <div style={{ fontSize: 12, color: "#4a4", marginTop: 4 }}>
                  Gợi ý cơ sở gần nhất: {storeSuggestions[0].name}
                  {Number.isFinite(storeSuggestions[0].distance_m) && ` (~${storeSuggestions[0].distance_m}m)`}
                </div>
              )}
              {storeDropdownOpen && storeSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    maxHeight: 200,
                    overflowY: "auto",
                    zIndex: 50,
                    border: "1px solid #222",
                    borderRadius: 10,
                    background: "#0b0b0b",
                    marginTop: 6,
                  }}
                >
                  {storeSuggestions.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStoreId(store.id);
                        setStoreName(store.name);
                        setStoreDropdownOpen(false);
                        setAutoSelectedStore(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 10px",
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{store.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                        {store.address_full}
                        {Number.isFinite(store.distance_m) && ` (~${store.distance_m}m)`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ marginBottom: 6, opacity: 0.8 }}>Ghi chú</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ padding: 8, width: "100%", minHeight: 64 }} />
            </div>
          </div>

          {/* CTKM */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, opacity: 0.8 }}>CTKM</div>
            <select value={promotionCode} onChange={(e) => setPromotionCode(e.target.value)} style={{ padding: 8, width: "100%" }}>
              <option value="">-- không áp dụng --</option>
              {promotions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.promo_type === "DISCOUNT" && p.percent_off != null ? `${p.name} (${p.percent_off}%)` : p.name}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              {quoting
                ? "⏳ Đang quote..."
                : quote?.meta?.free_upsize_applied
                ? `✅ Free upsize áp dụng (DRINK qty: ${quote.meta.drink_qty ?? "?"})`
                : `ℹ️ Free upsize chưa áp dụng (DRINK qty: ${quote?.meta?.drink_qty ?? "0"})`}
            </div>
          </div>

          {/* Shipping */}
          <div style={{ marginBottom: 12, padding: 10, border: "1px solid #222", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Phí ship</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Phí ship (VND)</div>
                <input
                  type="number"
                  min={0}
                  value={shippingFee}
                  onChange={(e) => setShippingFee(Math.max(0, Math.round(Number(e.target.value || 0))))}
                  style={{ padding: 8, width: "100%" }}
                />
              </div>

              <div>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Giảm ship (VND)</div>
                <input
                  type="number"
                  min={0}
                  value={shippingDiscount}
                  disabled={freeShipping}
                  onChange={(e) => setShippingDiscount(Math.max(0, Math.round(Number(e.target.value || 0))))}
                  style={{ padding: 8, width: "100%", opacity: freeShipping ? 0.6 : 1 }}
                />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} />
              <span>Miễn phí ship</span>
            </label>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Ship phải trả: <b>{formatMoney(shipping.pay)}</b>
              {shipping.discount > 0 ? ` (đã giảm ${formatMoney(shipping.discount)})` : ""}
            </div>
          </div>

          {/* Blocker */}
          {(!quote?.ok || hasMissingPrice) && (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 8,
                border: "1px solid rgba(239,68,68,0.5)",
                background: "rgba(239,68,68,0.08)",
                color: "#fecaca",
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              ❗ Không thể đặt đơn: {quote?.error || (hasMissingPrice ? "Có món thiếu giá" : "Quote chưa sẵn sàng")}.
            </div>
          )}

          {/* Totals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 10 }}>
            <div>Số lượng</div>
            <div style={{ textAlign: "right" }}>{itemTotals.totalQty}</div>

            <div>Tổng tiền (tiền món)</div>
            <div style={{ textAlign: "right", fontWeight: 800 }}>
              {hasAnyDiscount ? (
                <span style={{ textDecoration: "line-through", opacity: 0.8 }}>{formatMoney(itemsSubtotalBefore)}</span>
              ) : (
                formatMoney(itemsSubtotalBefore)
              )}
            </div>

            <div>Tổng sau giảm</div>
            <div style={{ textAlign: "right", fontWeight: 900 }}>
              {formatMoney(itemsPay)}
              {hasAnyDiscount && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>giảm {formatMoney(itemsDiscount)}</div>}
            </div>

            <div style={{ opacity: 0.7 }}>Chiết khấu (%)</div>
            <div style={{ textAlign: "right", opacity: 0.7 }}>{quote?.meta?.discount_percent ? `${quote.meta.discount_percent}%` : "0%"}</div>

            <div style={{ opacity: 0.7 }}>Tiền chiết khấu</div>
            <div style={{ textAlign: "right", opacity: 0.7 }}>{formatMoney(itemsDiscount)}</div>

            <hr style={{ gridColumn: "1 / -1", width: "100%", borderColor: "#222" }} />

            <div>Ship phải trả</div>
            <div style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(shipping.pay)}</div>

            <div>Tổng thanh toán</div>
            <div style={{ textAlign: "right", fontWeight: 900 }}>{formatMoney(grandTotal)}</div>
          </div>

          {/* Message preview */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800 }}>Tin nhắn xác nhận</div>
              <button
                onClick={copyMessage}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "rgba(148,163,184,0.18)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Copy
              </button>
            </div>

            <textarea
              ref={messageRef}
              value={confirmationMessage}
              readOnly
              style={{
                width: "100%",
                minHeight: 240,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #222",
                background: "rgba(2,6,23,0.25)",
                color: "inherit",
                fontSize: 12,
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
              }}
            />
          </div>

          <button
            disabled={hasMissingPrice || creatingOrder || quoting || !quote?.ok}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: hasMissingPrice || creatingOrder || quoting || !quote?.ok ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.25)",
              cursor: hasMissingPrice || creatingOrder || quoting || !quote?.ok ? "not-allowed" : "pointer",
              opacity: hasMissingPrice || creatingOrder || quoting || !quote?.ok ? 0.7 : 1,
              fontWeight: 800,
            }}
            onClick={onCreateOrder}
          >
            {creatingOrder ? "Đang tạo đơn..." : quoting ? "Đang quote..." : "Đặt đơn"}
          </button>
        </div>
      </div>

      {/* Product Picker Modal */}
      {showProductModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeProductModal();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeProductModal();
          }}
        >
          <div
            style={{
              background: "#1a1a1a",
              borderRadius: 8,
              width: "100%",
              maxWidth: 1200,
              height: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ padding: 20, borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Chọn món</h2>
              <button
                onClick={closeProductModal}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #666",
                  borderRadius: 4,
                  background: "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* Left Panel */}
              <div style={{ flex: 2, display: "flex", flexDirection: "column", borderRight: "1px solid #333" }}>
                {/* Search */}
                <div style={{ padding: 16 }}>
                  <input
                    type="text"
                    placeholder="Tìm món..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const filtered = (() => {
                          let list = products;
                          if (modalCategory !== "ALL") {
                            list = list.filter((p) => p.category?.includes(modalCategory));
                          }
                          if (modalSearchQuery) {
                            const normalized = normalizeVietnamese(modalSearchQuery);
                            list = list.filter((p) => {
                              const normName = normalizeVietnamese(p.name);
                              const normCode = normalizeVietnamese(p.product_code);
                              return normName.includes(normalized) || normCode.includes(normalized);
                            });
                          }
                          return list;
                        })();
                        if (filtered.length > 0) {
                          addProductToDraft(filtered[0]);
                        }
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: 12,
                      border: "1px solid #666",
                      borderRadius: 4,
                      background: "#0a0a0a",
                      color: "#ddd",
                      fontSize: 14,
                    }}
                  />
                </div>

                {/* Category Tabs */}
                <div style={{ display: "flex", gap: 8, padding: "0 16px 16px", flexWrap: "wrap" }}>
                  {categoryList.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setModalCategory(cat)}
                      style={{
                        padding: "8px 16px",
                        border: modalCategory === cat ? "2px solid #3b82f6" : "1px solid #666",
                        borderRadius: 6,
                        background: modalCategory === cat ? "#3b82f6" : "#2a2a2a",
                        color: modalCategory === cat ? "#fff" : "#ddd",
                        cursor: "pointer",
                        fontWeight: modalCategory === cat ? 600 : 400,
                      }}
                    >
                      {categoryLabel(cat)}
                    </button>
                  ))}
                </div>

                {/* Product Grid */}
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                    {(() => {
                      let filtered = products;
                      
                      // Category filter
                      if (modalCategory !== "ALL") {
                        filtered = filtered.filter((p) => p.category?.includes(modalCategory));
                      }
                      
                      // Search filter
                      if (modalSearchQuery) {
                        const normalized = normalizeVietnamese(modalSearchQuery);
                        filtered = filtered.filter((p) => {
                          const normName = normalizeVietnamese(p.name);
                          const normCode = normalizeVietnamese(p.product_code);
                          return normName.includes(normalized) || normCode.includes(normalized);
                        });
                        
                        // Sort: startsWith first
                        filtered = filtered.sort((a, b) => {
                          const aNorm = normalizeVietnamese(a.name);
                          const bNorm = normalizeVietnamese(b.name);
                          const aStarts = aNorm.startsWith(normalized) ? 0 : 1;
                          const bStarts = bNorm.startsWith(normalized) ? 0 : 1;
                          return aStarts - bStarts;
                        });
                      } else if (modalCategory === "ALL") {
                        // Prioritize DRINK in ALL
                        filtered = filtered.sort((a, b) => {
                          const aDrink = a.category?.includes("DRINK") ? 0 : 1;
                          const bDrink = b.category?.includes("DRINK") ? 0 : 1;
                          return aDrink - bDrink;
                        });
                      }
                      
                      // Limit results to 50
                      filtered = filtered.slice(0, 50);
                      
                      return filtered.map((product) => (
                        <div
                          key={product.product_id}
                          onClick={() => addProductToDraft(product)}
                          style={{
                            padding: 12,
                            border: "1px solid #444",
                            borderRadius: 6,
                            background: "#2a2a2a",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#3a3a3a";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#2a2a2a";
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{product.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{product.product_code}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Right Panel - Draft Line Editor */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
                <div style={{ padding: 16, borderBottom: "1px solid #333" }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Đã chọn ({draftLines.length})</h3>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  {draftLines.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#666", marginTop: 40 }}>Chưa chọn món nào</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {draftLines.map((draft) => {
                        const product = productById.get(draft.product_id);
                        const availSizes = getAvailableSizes(product ?? null);
                        const isDrink = product?.category?.includes("DRINK");
                        const sugarOpts = isDrink ? sugarMap[draft.product_id] : undefined;
                        
                        return (
                          <div
                            key={draft.id}
                            style={{
                              padding: 12,
                              border: "1px solid #333",
                              borderRadius: 6,
                              background: "#1a1a1a",
                            }}
                          >
                            {/* Product Name + Qty Inline */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div>
                                <div style={{ fontWeight: 500 }}>{product?.name}</div>
                                <div style={{ fontSize: 11, color: "#666" }}>
                                  {(() => {
                                    const prices = [product?.price_phe, product?.price_la, product?.price_std].filter((x) => x != null && x > 0);
                                    return prices.length > 0 ? `${formatMoney(Math.min(...(prices as number[])))}đ` : "—";
                                  })()}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button
                                  onClick={() => updateDraftLine(draft.id, { qty: Math.max(1, draft.qty - 1) })}
                                  style={{
                                    padding: "4px 10px",
                                    border: "1px solid #666",
                                    borderRadius: 4,
                                    background: "#2a2a2a",
                                    color: "#ddd",
                                    cursor: "pointer",
                                    fontSize: 14,
                                  }}
                                >
                                  −
                                </button>
                                <span style={{ minWidth: 30, textAlign: "center", fontWeight: 600 }}>{draft.qty}</span>
                                <button
                                  onClick={() => updateDraftLine(draft.id, { qty: draft.qty + 1 })}
                                  style={{
                                    padding: "4px 10px",
                                    border: "1px solid #666",
                                    borderRadius: 4,
                                    background: "#2a2a2a",
                                    color: "#ddd",
                                    cursor: "pointer",
                                    fontSize: 14,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            
                            {/* Size */}
                            {availSizes.length > 1 && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Size:</div>
                                <ChipGroup
                                  value={draft.size}
                                  options={[
                                    { value: "SIZE_PHE", label: "Phê", disabled: !availSizes.includes("SIZE_PHE") },
                                    { value: "SIZE_LA", label: "La", disabled: !availSizes.includes("SIZE_LA") },
                                    { value: "STD", label: "STD", disabled: !availSizes.includes("STD") },
                                  ]}
                                  onChange={(size) => updateDraftLine(draft.id, { size: size as SizeKey })}
                                />
                              </div>
                            )}
                            
                            {/* Sugar */}
                            {isDrink && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Đường:</div>
                                <div style={{ maxHeight: 120, overflowY: "auto" }}>
                                  <ChipGroup
                                    compact
                                    value={draft.sugar_value_code}
                                    options={
                                      sugarOpts === undefined
                                        ? [{ value: "", label: "(loading...)", disabled: true }]
                                        : sugarOpts.length === 0
                                        ? [{ value: "", label: "—", disabled: true }]
                                        : sugarOpts.map((o) => ({
                                            value: o.value_code,
                                            label: o.label
                                              .replace(/\s*đường\s*$/i, "")
                                              .replace(/^Độ ngọt bình thường$/i, "Bình thường"),
                                          }))
                                    }
                                    onChange={(sugarCode) => updateDraftLine(draft.id, { sugar_value_code: sugarCode })}
                                    onInteract={async () => {
                                      if (sugarOpts === undefined) {
                                        await ensureSugarOptions(draft.product_id);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* Note */}
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Ghi chú:</div>
                              <input
                                type="text"
                                placeholder="Thêm ghi chú..."
                                value={draft.note}
                                onChange={(e) => updateDraftLine(draft.id, { note: e.target.value })}
                                style={{
                                  width: "100%",
                                  padding: 6,
                                  border: "1px solid #666",
                                  borderRadius: 4,
                                  background: "#0a0a0a",
                                  color: "#ddd",
                                  fontSize: 13,
                                }}
                              />
                            </div>
                            
                            {/* Remove */}
                            <button
                              onClick={() => removeDraftLine(draft.id)}
                              style={{
                                width: "100%",
                                padding: "6px 12px",
                                border: "1px solid #666",
                                borderRadius: 4,
                                background: "transparent",
                                color: "#f87171",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              Xóa
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: 20, borderTop: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={closeProductModal}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #666",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Hủy
              </button>
              <button
                onClick={addDraftLinesToOrder}
                disabled={draftLines.length === 0}
                style={{
                  padding: "10px 24px",
                  border: "none",
                  borderRadius: 6,
                  background: draftLines.length > 0 ? "#3b82f6" : "#444",
                  color: draftLines.length > 0 ? "#fff" : "#888",
                  cursor: draftLines.length > 0 ? "pointer" : "not-allowed",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {editLineId ? "Lưu" : `Thêm vào đơn (${draftLines.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}