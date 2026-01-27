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
};

type QuoteLine = {
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
  const [note, setNote] = useState<string>("");

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [defaultAddress, setDefaultAddress] = useState("");

  const [addrQuery, setAddrQuery] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState<any[]>([]);
  const [selectedAddr, setSelectedAddr] = useState<any | null>(null);

  const [shippingFee, setShippingFee] = useState<number>(0);
  const [freeShipping, setFreeShipping] = useState<boolean>(false);
  const [shippingDiscount, setShippingDiscount] = useState<number>(0);

  const [creatingOrder, setCreatingOrder] = useState(false);

  const messageRef = useRef<HTMLTextAreaElement | null>(null);

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
