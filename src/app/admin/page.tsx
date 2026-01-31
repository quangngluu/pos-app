"use client";

import { useState, useEffect, useRef } from "react";

type Store = {
  id: string;
  name: string;
  address_full: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  updated_at: string;
  created_at: string;
  // Structured address fields
  addr_line1?: string | null;
  addr_ward?: string | null;
  addr_district?: string | null;
  addr_city?: string | null;
  addr_state?: string | null;
  addr_postcode?: string | null;
  addr_country?: string | null;
  addr_place_id?: string | null;
  addr_display_name?: string | null;
};

type Promotion = {
  code: string;
  name: string;
  promo_type: string;
  priority: number;
  is_stackable: boolean;
  is_active: boolean;
  start_at: string | null;
  end_at: string | null;
  percent_off: number | null;
  min_qty: number | null;
  scopes?: string[]; // Category scopes
};

type Product = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
  prices: {
    STD?: number;
    SIZE_PHE?: number;
    SIZE_LA?: number;
  };
};

type Category = {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Tab = "stores" | "promotions" | "products" | "categories";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("stores");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 24 }}>Admin Panel</h1>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 6,
            color: "#ef4444",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 12,
              padding: "4px 8px",
              background: "transparent",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: 4,
              color: "#ef4444",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #333" }}>
        <button
          onClick={() => setActiveTab("stores")}
          style={{
            padding: "12px 24px",
            background: activeTab === "stores" ? "#2a2a2a" : "transparent",
            border: "none",
            borderBottom: activeTab === "stores" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "stores" ? "#fff" : "#888",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Stores
        </button>
        <button
          onClick={() => setActiveTab("promotions")}
          style={{
            padding: "12px 24px",
            background: activeTab === "promotions" ? "#2a2a2a" : "transparent",
            border: "none",
            borderBottom: activeTab === "promotions" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "promotions" ? "#fff" : "#888",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Promotions
        </button>
        <button
          onClick={() => setActiveTab("products")}
          style={{
            padding: "12px 24px",
            background: activeTab === "products" ? "#2a2a2a" : "transparent",
            border: "none",
            borderBottom: activeTab === "products" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "products" ? "#fff" : "#888",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Products
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          style={{
            padding: "12px 24px",
            background: activeTab === "categories" ? "#2a2a2a" : "transparent",
            border: "none",
            borderBottom: activeTab === "categories" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "categories" ? "#fff" : "#888",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Categories
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "stores" && <StoresTab setError={setError} />}
      {activeTab === "promotions" && <PromotionsTab setError={setError} />}
      {activeTab === "products" && <ProductsTab setError={setError} />}
      {activeTab === "categories" && <CategoriesTab setError={setError} />}
    </div>
  );
}

// ============================================================
// STORES TAB
// ============================================================
function StoresTab({ setError }: { setError: (msg: string | null) => void }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "province" | "updated">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Extract province/region from structured address or fallback to parsing address_full
  const extractProvince = (store: Store): string => {
    // Priority: use structured fields if available
    if (store.addr_ward || store.addr_district || store.addr_city || store.addr_state) {
      const parts = [
        store.addr_ward,
        store.addr_district,
        store.addr_city || store.addr_state
      ].filter(Boolean);
      return parts.join(", ") || "-";
    }
    
    // Fallback: parse from address_full
    if (!store.address_full) return "-";
    const parts = store.address_full.split(",").map(p => p.trim());
    // Return last 1-2 parts as province (e.g., "Quận 3, TP HCM" or "Hà Nội")
    if (parts.length >= 2) {
      return parts.slice(-2).join(", ");
    }
    return parts[parts.length - 1] || "-";
  };

  const fetchStores = async (q = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setStores(data.stores);
    } catch (err: any) {
      setError(err.message || "Failed to fetch stores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores(search);
  }, [search]);

  const handleCreate = () => {
    setEditingStore(null);
    setShowModal(true);
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setShowModal(true);
  };

  const handleSave = async (payload: any) => {
    setError(null);
    try {
      const isEdit = !!editingStore;
      const url = "/api/admin/stores";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? { id: editingStore!.id, patch: payload } : payload;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setShowModal(false);
      fetchStores(search);
    } catch (err: any) {
      setError(err.message || "Failed to save store");
    }
  };

  const handleSort = (column: "name" | "province" | "updated") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // Sort stores
  const sortedStores = [...stores].sort((a, b) => {
    let compareResult = 0;
    
    if (sortBy === "name") {
      compareResult = a.name.localeCompare(b.name);
    } else if (sortBy === "province") {
      const provA = extractProvince(a);
      const provB = extractProvince(b);
      compareResult = provA.localeCompare(provB);
    } else if (sortBy === "updated") {
      compareResult = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    }
    
    return sortOrder === "asc" ? compareResult : -compareResult;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search stores..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 6,
            color: "#fff",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + Create Store
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Loading...</div>
      ) : stores.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>No stores found</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #444" }}>
                <th 
                  onClick={() => handleSort("name")}
                  style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500, cursor: "pointer", userSelect: "none" }}
                >
                  Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Address</th>
                <th 
                  onClick={() => handleSort("province")}
                  style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500, cursor: "pointer", userSelect: "none" }}
                >
                  Province/Region {sortBy === "province" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Active</th>
                <th 
                  onClick={() => handleSort("updated")}
                  style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500, cursor: "pointer", userSelect: "none" }}
                >
                  Updated {sortBy === "updated" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedStores.map((store) => {
                // Display line1 if available, otherwise show truncated address_full
                const displayAddress = store.addr_line1 || store.address_full || "-";
                
                return (
                  <tr key={store.id} style={{ borderBottom: "1px solid #333" }}>
                    <td style={{ padding: 12 }}>{store.name}</td>
                    <td style={{ padding: 12, color: "#888", fontSize: 13, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {displayAddress}
                    </td>
                    <td style={{ padding: 12, color: "#aaa", fontSize: 13 }}>
                      {extractProvince(store)}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          background: store.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                          color: store.is_active ? "#22c55e" : "#9ca3af",
                        }}
                      >
                        {store.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: 12, color: "#888", fontSize: 14 }}>
                      {new Date(store.updated_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleEdit(store)}
                        style={{
                          padding: "4px 12px",
                          background: "#2a2a2a",
                          border: "1px solid #444",
                          borderRadius: 4,
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <StoreModal
          store={editingStore}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function StoreModal({
  store,
  onClose,
  onSave,
}: {
  store: Store | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [name, setName] = useState(store?.name || "");
  const [addressFull, setAddressFull] = useState(store?.address_full || "");
  const [isActive, setIsActive] = useState(store?.is_active ?? true);
  const [lat, setLat] = useState<number | null>(store?.lat ?? null);
  const [lng, setLng] = useState<number | null>(store?.lng ?? null);

  // Structured address fields
  const [addrLine1, setAddrLine1] = useState<string | null>(store?.addr_line1 ?? null);
  const [addrWard, setAddrWard] = useState<string | null>(store?.addr_ward ?? null);
  const [addrDistrict, setAddrDistrict] = useState<string | null>(store?.addr_district ?? null);
  const [addrCity, setAddrCity] = useState<string | null>(store?.addr_city ?? null);
  const [addrState, setAddrState] = useState<string | null>(store?.addr_state ?? null);
  const [addrPostcode, setAddrPostcode] = useState<string | null>(store?.addr_postcode ?? null);
  const [addrCountry, setAddrCountry] = useState<string | null>(store?.addr_country ?? null);
  const [addrPlaceId, setAddrPlaceId] = useState<string | null>(store?.addr_place_id ?? null);
  const [addrDisplayName, setAddrDisplayName] = useState<string | null>(store?.addr_display_name ?? null);
  const [addrRaw, setAddrRaw] = useState<any>(null);

  // Address autocomplete state
  const [addrQuery, setAddrQuery] = useState(store?.address_full || "");
  const [addrSuggestions, setAddrSuggestions] = useState<any[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrSessionToken] = useState(() => `store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch autocomplete suggestions
  const fetchSuggestions = async (query: string) => {
    if (query.trim().length < 3) {
      setAddrSuggestions([]);
      setAddrOpen(false);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setAddrLoading(true);
    setAddrError(null);

    try {
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(query)}&sessionToken=${addrSessionToken}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!res.ok) throw new Error("Failed to fetch suggestions");

      const data = await res.json();
      if (data.ok && data.items) {
        setAddrSuggestions(data.items);
        setAddrOpen(data.items.length > 0);
      } else {
        setAddrSuggestions([]);
        setAddrOpen(false);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Autocomplete error:", err);
        setAddrError(err.message);
        setAddrSuggestions([]);
        setAddrOpen(false);
      }
    } finally {
      setAddrLoading(false);
    }
  };

  // Debounced address input handler
  const handleAddressInput = (value: string) => {
    setAddrQuery(value);
    setAddressFull(value); // Sync to addressFull for state consistency
    setSelectedPlaceId(null); // User is typing, not programmatic

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 250);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = async (item: any) => {
    setAddrOpen(false);
    setAddrSuggestions([]);
    setAddrLoading(true);
    setSelectedPlaceId(item.place_id);

    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(item.place_id)}&sessionToken=${addrSessionToken}`
      );

      if (!res.ok) throw new Error("Failed to fetch place details");

      const data = await res.json();
      if (data.ok) {
        // Extract structured address from response
        const addr = data.address || {};
        const fullAddr = data.full_address || data.display_name || "";
        const latVal = typeof data.lat === "number" ? data.lat : null;
        const lngVal = typeof data.lng === "number" ? data.lng : (typeof data.lon === "number" ? data.lon : null);

        // Update all structured fields
        setAddressFull(fullAddr);
        setAddrQuery(fullAddr);
        setAddrDisplayName(fullAddr);
        setAddrLine1(addr.line1 || null);
        setAddrWard(addr.ward || null);
        setAddrDistrict(addr.district || null);
        setAddrCity(addr.city || null);
        setAddrState(addr.state || null);
        setAddrPostcode(addr.postcode || null);
        setAddrCountry(addr.country || null);
        setAddrPlaceId(data.place_id || null);
        setAddrRaw(data.raw || null);
        setLat(latVal);
        setLng(lngVal);

        console.debug("Place selected:", { place_id: item.place_id, address: fullAddr, lat: latVal, lng: lngVal, ward: addr.ward, district: addr.district });
      }
    } catch (err: any) {
      console.error("Place details error:", err);
      setAddrError(err.message);
    } finally {
      setAddrLoading(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setAddrOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddrOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = () => {
    if (!name.trim()) {
      alert("Name is required");
      return;
    }
    
    // Sync addrQuery to addressFull before saving
    const finalAddress = addrQuery.trim() || null;
    
    // Show warning if no coordinates (manual input)
    if (!lat || !lng) {
      const confirmed = confirm(
        "⚠️ Cảnh báo: Không có tọa độ (lat/lng).\n\n" +
        "Chức năng gợi ý cửa hàng gần nhất có thể không hoạt động cho cửa hàng này.\n\n" +
        "Bạn có chắc muốn tiếp tục không?"
      );
      if (!confirmed) return;
    }
    
    onSave({
      name: name.trim(),
      address_full: finalAddress,
      lat: lat,
      lng: lng,
      is_active: isActive,
      // Structured address fields
      addr_line1: addrLine1,
      addr_ward: addrWard,
      addr_district: addrDistrict,
      addr_city: addrCity,
      addr_state: addrState,
      addr_postcode: addrPostcode,
      addr_country: addrCountry,
      addr_place_id: addrPlaceId,
      addr_display_name: addrDisplayName,
      addr_raw: addrRaw,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          padding: 24,
          borderRadius: 8,
          width: "90%",
          maxWidth: 500,
          border: "1px solid #333",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          {store ? "Edit Store" : "Create Store"}
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Address</label>
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={addrQuery}
              onChange={(e) => handleAddressInput(e.target.value)}
              onBlur={() => {
                // Delay to allow click on dropdown item
                setTimeout(() => {
                  if (!dropdownRef.current?.contains(document.activeElement)) {
                    setAddrOpen(false);
                  }
                }, 200);
              }}
              placeholder="Nhập địa chỉ để tìm kiếm..."
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />

            {/* Autocomplete dropdown */}
            {addrOpen && addrSuggestions.length > 0 && (
              <div
                ref={dropdownRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: "#1a1a1a",
                  border: "1px solid #444",
                  borderRadius: 6,
                  maxHeight: 300,
                  overflowY: "auto",
                  zIndex: 1001,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                {addrSuggestions.map((item, idx) => (
                  <div
                    key={item.place_id || idx}
                    onClick={() => handleSelectSuggestion(item)}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      borderBottom: idx < addrSuggestions.length - 1 ? "1px solid #2a2a2a" : "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#2a2a2a";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ fontSize: 14, color: "#fff", marginBottom: 2 }}>
                      {item.display_name || item.main_text || ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      {item.full_address || item.secondary_text || ""}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {addrLoading && (
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Đang tìm...</div>
            )}

            {addrError && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{addrError}</div>
            )}

            {/* Warning if address changed but no coordinates */}
            {addrQuery.trim() && !selectedPlaceId && !lat && !lng && (
              <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
                💡 Nên chọn từ gợi ý để cập nhật tọa độ
              </div>
            )}
          </div>
        </div>

        {/* Address Preview (when structured address is available) */}
        {(addrLine1 || addrWard || addrDistrict || addrCity) && (
          <div style={{ marginBottom: 12, padding: 12, background: "#2a2a2a", borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 500 }}>
              📍 Địa chỉ đã chọn:
            </div>
            {addrLine1 && (
              <div style={{ fontSize: 13, color: "#fff", marginBottom: 2 }}>
                {addrLine1}
              </div>
            )}
            {(addrWard || addrDistrict || addrCity || addrState) && (
              <div style={{ fontSize: 13, color: "#aaa" }}>
                {[addrWard, addrDistrict, addrCity || addrState].filter(Boolean).join(", ")}
              </div>
            )}
            {(lat && lng) && (
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                📍 Tọa độ: {lat.toFixed(6)}, {lng.toFixed(6)}
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Active</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROMOTIONS TAB
// ============================================================
function PromotionsTab({ setError }: { setError: (msg: string | null) => void }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  const fetchPromotions = async (q = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promotions?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPromotions(data.promotions);
    } catch (err: any) {
      setError(err.message || "Failed to fetch promotions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions(search);
  }, [search]);

  const handleCreate = () => {
    setEditingPromotion(null);
    setShowModal(true);
  };

  const handleEdit = (promo: Promotion) => {
    setEditingPromotion(promo);
    setShowModal(true);
  };

  const handleSave = async (payload: any) => {
    setError(null);
    try {
      const isEdit = !!editingPromotion;
      const url = "/api/admin/promotions";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? { code: editingPromotion!.code, patch: payload } : payload;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setShowModal(false);
      fetchPromotions(search);
    } catch (err: any) {
      setError(err.message || "Failed to save promotion");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search promotions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 6,
            color: "#fff",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + Create Promotion
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Loading...</div>
      ) : promotions.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>No promotions found</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #444" }}>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Code</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Name</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Type</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>% Off</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Min Qty</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Priority</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Stackable</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Active</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((promo) => (
                <tr key={promo.code} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: 12, fontWeight: 500 }}>{promo.code}</td>
                  <td style={{ padding: 12 }}>{promo.name}</td>
                  <td style={{ padding: 12, color: "#888", fontSize: 14 }}>{promo.promo_type}</td>
                  <td style={{ padding: 12 }}>{promo.percent_off ?? "-"}</td>
                  <td style={{ padding: 12 }}>{promo.min_qty ?? "-"}</td>
                  <td style={{ padding: 12 }}>{promo.priority}</td>
                  <td style={{ padding: 12 }}>{promo.is_stackable ? "Yes" : "No"}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: promo.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                        color: promo.is_active ? "#22c55e" : "#9ca3af",
                      }}
                    >
                      {promo.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleEdit(promo)}
                      style={{
                        padding: "4px 12px",
                        background: "#2a2a2a",
                        border: "1px solid #444",
                        borderRadius: 4,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PromotionModal
          promotion={editingPromotion}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function PromotionModal({
  promotion,
  onClose,
  onSave,
}: {
  promotion: Promotion | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [code, setCode] = useState(promotion?.code || "");
  const [name, setName] = useState(promotion?.name || "");
  const [promoType, setPromoType] = useState(promotion?.promo_type || "");
  const [priority, setPriority] = useState(promotion?.priority?.toString() || "0");
  const [isStackable, setIsStackable] = useState(promotion?.is_stackable ?? false);
  const [isActive, setIsActive] = useState(promotion?.is_active ?? true);
  const [startAt, setStartAt] = useState(promotion?.start_at || "");
  const [endAt, setEndAt] = useState(promotion?.end_at || "");
  const [percentOff, setPercentOff] = useState(promotion?.percent_off?.toString() || "");
  const [minQty, setMinQty] = useState(promotion?.min_qty?.toString() || "");

  // Category scopes for DISCOUNT
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(promotion?.scopes || [])
  );
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Load available categories from products
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const res = await fetch("/api/admin/products");
        const data = await res.json();
        if (data.ok && data.products) {
          const categories = Array.from(
            new Set(
              data.products
                .map((p: any) => p.category)
                .filter((c: any) => c && c.trim())
            )
          ) as string[];

          // Sort: DRINK, CAKE, TOPPING, MERCHANDISE first, then alphabetical
          const priority = ["DRINK", "CAKE", "TOPPING", "MERCHANDISE"];
          categories.sort((a, b) => {
            const aIdx = priority.indexOf(a);
            const bIdx = priority.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
          });

          setAvailableCategories(categories);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  const toggleCategory = (category: string) => {
    const newSet = new Set(selectedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setSelectedCategories(newSet);
  };

  const handleSubmit = () => {
    if (!code.trim() || !name.trim() || !promoType.trim()) {
      alert("Code, Name, and Promo Type are required");
      return;
    }

    // Validation: DISCOUNT with no categories
    if (promoType.trim() === "DISCOUNT" && selectedCategories.size === 0) {
      const confirmed = confirm(
        "⚠️ DISCOUNT không chọn category sẽ không áp dụng (apply NONE). Bạn có chắc muốn lưu?"
      );
      if (!confirmed) return;
    }

    const payload: any = { name: name.trim(), promo_type: promoType.trim() };

    if (priority.trim()) payload.priority = parseInt(priority);
    payload.is_stackable = isStackable;
    payload.is_active = isActive;
    if (startAt.trim()) payload.start_at = startAt.trim();
    if (endAt.trim()) payload.end_at = endAt.trim();
    if (percentOff.trim()) payload.percent_off = parseFloat(percentOff);
    if (minQty.trim()) payload.min_qty = parseInt(minQty);

    // Add scopes if DISCOUNT
    if (promoType.trim() === "DISCOUNT") {
      payload.scopes = Array.from(selectedCategories);
    }

    if (promotion) {
      // Edit mode: don't include code in patch
      onSave(payload);
    } else {
      // Create mode: include code
      onSave({ code: code.trim(), ...payload });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          padding: 24,
          borderRadius: 8,
          width: "90%",
          maxWidth: 600,
          border: "1px solid #333",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          {promotion ? "Edit Promotion" : "Create Promotion"}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Code *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!promotion}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: promotion ? "#1a1a1a" : "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: promotion ? "#666" : "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Promo Type *</label>
            <input
              type="text"
              value={promoType}
              onChange={(e) => setPromoType(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Percent Off (0-100)</label>
            <input
              type="number"
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value)}
              min="0"
              max="100"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Min Qty</label>
            <input
              type="number"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              min="0"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>Start At</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>End At</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>
        </div>

        {/* Category Scopes for DISCOUNT */}
        {promoType === "DISCOUNT" && (
          <div style={{ marginBottom: 16, padding: 12, background: "#2a2a2a", borderRadius: 6 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
              Áp dụng cho danh mục (Category)
            </label>
            {loadingCategories ? (
              <div style={{ fontSize: 12, color: "#888" }}>Đang tải...</div>
            ) : availableCategories.length === 0 ? (
              <div style={{ fontSize: 12, color: "#888" }}>Không có category nào</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {availableCategories.map((cat) => {
                  const isSelected = selectedCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      style={{
                        padding: "6px 12px",
                        background: isSelected ? "#3b82f6" : "#1a1a1a",
                        border: `1px solid ${isSelected ? "#3b82f6" : "#444"}`,
                        borderRadius: 4,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: isSelected ? 500 : 400,
                      }}
                    >
                      {isSelected && "✓ "}
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedCategories.size === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b" }}>
                ⚠️ DISCOUNT không chọn category sẽ không áp dụng (apply NONE)
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isStackable}
              onChange={(e) => setIsStackable(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Stackable</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Active</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PRODUCTS TAB
// ============================================================
function ProductsTab({ setError }: { setError: (msg: string | null) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async (q = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setProducts(data.products);
    } catch (err: any) {
      setError(err.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(search);
  }, [search]);

  const handleCreate = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowModal(true);
  };

  const handleSave = async (payload: any) => {
    setError(null);
    try {
      const isEdit = !!editingProduct;
      const url = "/api/admin/products";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? { id: editingProduct!.id, patch: payload.patch, prices: payload.prices }
        : payload;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setShowModal(false);
      fetchProducts(search);
    } catch (err: any) {
      setError(err.message || "Failed to save product");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 6,
            color: "#fff",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + Create Product
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Loading...</div>
      ) : products.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>No products found</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #444" }}>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Code</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Name</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Category</th>
                <th style={{ padding: 12, textAlign: "right", color: "#888", fontWeight: 500 }}>STD</th>
                <th style={{ padding: 12, textAlign: "right", color: "#888", fontWeight: 500 }}>PHE</th>
                <th style={{ padding: 12, textAlign: "right", color: "#888", fontWeight: 500 }}>LA</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Active</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: 12, fontFamily: "monospace" }}>{product.code}</td>
                  <td style={{ padding: 12 }}>{product.name}</td>
                  <td style={{ padding: 12, color: "#888", fontSize: 14 }}>{product.category || "-"}</td>
                  <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace" }}>
                    {product.prices.STD?.toLocaleString() || "-"}
                  </td>
                  <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace" }}>
                    {product.prices.SIZE_PHE?.toLocaleString() || "-"}
                  </td>
                  <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace" }}>
                    {product.prices.SIZE_LA?.toLocaleString() || "-"}
                  </td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: product.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                        color: product.is_active ? "#22c55e" : "#9ca3af",
                      }}
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleEdit(product)}
                      style={{
                        padding: "4px 12px",
                        background: "#2a2a2a",
                        border: "1px solid #444",
                        borderRadius: 4,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ============================================================
// CATEGORIES TAB
// ============================================================
function CategoriesTab({ setError }: { setError: (msg: string | null) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const fetchCategories = async (q = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setCategories(data.categories);
    } catch (err: any) {
      setError(err.message || "Failed to fetch categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories(search);
  }, [search]);

  const handleCreate = () => {
    setEditingCategory(null);
    setShowModal(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setShowModal(true);
  };

  const handleSave = async (payload: any) => {
    setError(null);
    try {
      const isEdit = !!editingCategory;
      const url = "/api/admin/categories";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? { code: editingCategory!.code, patch: payload } : payload;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setShowModal(false);
      fetchCategories(search);
    } catch (err: any) {
      setError(err.message || "Failed to save category");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 6,
            color: "#fff",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + Create Category
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Loading...</div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#888" }}>No categories found</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #444" }}>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Code</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Name</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Sort Order</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Active</th>
                <th style={{ padding: 12, textAlign: "left", color: "#888", fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.code} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: 12, fontFamily: "monospace" }}>{cat.code}</td>
                  <td style={{ padding: 12 }}>{cat.name}</td>
                  <td style={{ padding: 12, color: "#888" }}>{cat.sort_order}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: cat.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.1)",
                        color: cat.is_active ? "#22c55e" : "#9ca3af",
                      }}
                    >
                      {cat.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleEdit(cat)}
                      style={{
                        padding: "4px 12px",
                        background: "#2a2a2a",
                        border: "1px solid #444",
                        borderRadius: 4,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CategoryModal
          category={editingCategory}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function CategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [code, setCode] = useState(category?.code || "");
  const [name, setName] = useState(category?.name || "");
  const [sortOrder, setSortOrder] = useState(category?.sort_order?.toString() || "0");
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  const handleSubmit = () => {
    if (!code.trim()) {
      alert("Code is required");
      return;
    }
    if (!name.trim()) {
      alert("Name is required");
      return;
    }

    onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      sort_order: parseInt(sortOrder) || 0,
      is_active: isActive,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 24 }}>
          {category ? "Edit Category" : "Create Category"}
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Code *
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!!category}
            placeholder="DRINK, CAKE, TOPPING..."
            style={{
              width: "100%",
              padding: "8px 12px",
              background: category ? "#1a1a1a" : "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              textTransform: "uppercase",
            }}
          />
          {category && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Code cannot be changed after creation
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Đồ uống, Bánh..."
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Sort Order
          </label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            min="0"
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Active</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  // State
  const [code, setCode] = useState(product?.code || "");
  const [name, setName] = useState(product?.name || "");
  const [category, setCategory] = useState(product?.category || "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  
  // Price mode: "single" (STD only) or "multi" (PHE/LA/STD)
  const [priceMode, setPriceMode] = useState<"single" | "multi">("single");
  const [priceSTD, setPriceSTD] = useState(product?.prices.STD?.toString() || "");
  const [pricePHE, setPricePHE] = useState(product?.prices.SIZE_PHE?.toString() || "");
  const [priceLA, setPriceLA] = useState(product?.prices.SIZE_LA?.toString() || "");
  
  // Categories dropdown
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  
  // Code generation
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!product); // If editing, code was manually set
  const [codeEditing, setCodeEditing] = useState(false);

  // Load categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Determine price mode from existing prices
  useEffect(() => {
    if (product) {
      const hasSizePrices = product.prices.SIZE_PHE || product.prices.SIZE_LA;
      setPriceMode(hasSizePrices ? "multi" : "single");
    }
  }, [product]);

  // Auto-generate code when category or name changes (only if not manually edited)
  useEffect(() => {
    if (!product && !codeManuallyEdited && category && name) {
      generateCode(category, name);
    }
  }, [category, name, codeManuallyEdited, product]);

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      if (data.ok) {
        setCategories(data.categories.filter((c: Category) => c.is_active));
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const generateCode = async (cat: string, productName: string) => {
    try {
      const res = await fetch(
        `/api/admin/products/generate-code?category=${encodeURIComponent(cat)}&name=${encodeURIComponent(productName)}`
      );
      const data = await res.json();
      if (data.ok && data.code) {
        setCode(data.code);
      }
    } catch (err) {
      console.error("Failed to generate code:", err);
    }
  };

  const handleCodeEdit = () => {
    setCodeEditing(true);
    setCodeManuallyEdited(true);
  };

  const handleSubmit = () => {
    if (!code.trim() || !name.trim()) {
      alert("Code and Name are required");
      return;
    }
    if (!category.trim()) {
      alert("Category is required");
      return;
    }

    const prices: any = {};
    
    if (priceMode === "single") {
      if (priceSTD.trim() && !isNaN(parseFloat(priceSTD))) {
        prices.STD = parseFloat(priceSTD);
      }
    } else {
      // Multi-size mode
      if (pricePHE.trim() && !isNaN(parseFloat(pricePHE))) prices.SIZE_PHE = parseFloat(pricePHE);
      if (priceLA.trim() && !isNaN(parseFloat(priceLA))) prices.SIZE_LA = parseFloat(priceLA);
      if (priceSTD.trim() && !isNaN(parseFloat(priceSTD))) prices.STD = parseFloat(priceSTD);
    }

    if (product) {
      // Edit mode
      onSave({
        patch: {
          code: code.trim(),
          name: name.trim(),
          category: category.trim(),
          is_active: isActive,
        },
        prices,
        priceMode, // Send mode to clean up unused keys
      });
    } else {
      // Create mode
      onSave({
        code: code.trim(),
        name: name.trim(),
        category: category.trim(),
        is_active: isActive,
        prices,
      });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          padding: 24,
          borderRadius: 8,
          width: "90%",
          maxWidth: 700,
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid #333",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>
          {product ? "Edit Product" : "Create Product"}
        </h2>

        {/* Category Dropdown */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Category *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={categoriesLoading}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              fontSize: 14,
            }}
          >
            <option value="">-- Select Category --</option>
            {categories.map((cat) => (
              <option key={cat.code} value={cat.code}>
                {cat.name} ({cat.code})
              </option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Phở mai cà phê..."
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
            }}
          />
        </div>

        {/* Code (auto-generated or editable) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
            Code *
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!codeEditing && !product}
              placeholder="Auto-generated..."
              style={{
                flex: 1,
                padding: "8px 12px",
                background: (!codeEditing && !product) ? "#1a1a1a" : "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
                fontFamily: "monospace",
              }}
            />
            {!product && !codeEditing && (
              <button
                onClick={handleCodeEdit}
                style={{
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Edit
              </button>
            )}
          </div>
          {!product && !codeManuallyEdited && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Code auto-generated from category + name
            </div>
          )}
        </div>

        {/* Price Mode Selection */}
        <div style={{ marginBottom: 16, padding: 16, background: "#2a2a2a", borderRadius: 8 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#888", fontWeight: 500 }}>
            Pricing Mode
          </label>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="radio"
                checked={priceMode === "single"}
                onChange={() => setPriceMode("single")}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>1 size (STD only)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="radio"
                checked={priceMode === "multi"}
                onChange={() => setPriceMode("multi")}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>Multiple sizes (PHÊ/LA/STD)</span>
            </label>
          </div>
        </div>

        {/* Price Inputs */}
        {priceMode === "single" ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
              Price (STD)
            </label>
            <input
              type="number"
              value={priceSTD}
              onChange={(e) => setPriceSTD(e.target.value)}
              min="0"
              step="1000"
              placeholder="45000"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
                Price PHÊ
              </label>
              <input
                type="number"
                value={pricePHE}
                onChange={(e) => setPricePHE(e.target.value)}
                min="0"
                step="1000"
                placeholder="35000"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: 6,
                  color: "#fff",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
                Price LA
              </label>
              <input
                type="number"
                value={priceLA}
                onChange={(e) => setPriceLA(e.target.value)}
                min="0"
                step="1000"
                placeholder="45000"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: 6,
                  color: "#fff",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#888" }}>
                Price STD (optional)
              </label>
              <input
                type="number"
                value={priceSTD}
                onChange={(e) => setPriceSTD(e.target.value)}
                min="0"
                step="1000"
                placeholder="55000"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: 6,
                  color: "#fff",
                }}
              />
            </div>
          </div>
        )}

        {/* Active Toggle */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Active</span>
          </label>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#2a2a2a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
