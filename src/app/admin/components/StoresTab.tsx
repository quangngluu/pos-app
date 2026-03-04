"use client";

import { useState, useEffect, useRef } from "react";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";
import { Store, sharedStyles } from "./shared";

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
        setAddressFull(value);
        setSelectedPlaceId(null);

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
                const addr = data.address || {};
                const fullAddr = data.full_address || data.display_name || "";
                const latVal = typeof data.lat === "number" ? data.lat : null;
                const lngVal = typeof data.lng === "number" ? data.lng : (typeof data.lon === "number" ? data.lon : null);

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

        const finalAddress = addrQuery.trim() || null;

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
                background: "rgba(15,23,42,0.45)",
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
                    ...sharedStyles.modalCard,
                    width: "90%",
                    maxWidth: 500,
                }}
            >
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
                    {store ? "Edit Store" : "Create Store"}
                </h2>

                {/* Name */}
                <div style={{ marginBottom: 16 }}>
                    <label style={sharedStyles.label}>Name *</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Store name"
                        style={sharedStyles.input}
                    />
                </div>

                {/* Address with autocomplete */}
                <div style={{ marginBottom: 16, position: "relative" }}>
                    <label style={sharedStyles.label}>
                        Address {addrLoading && "(loading...)"}
                    </label>
                    <input
                        ref={inputRef}
                        type="text"
                        value={addrQuery}
                        onChange={(e) => handleAddressInput(e.target.value)}
                        placeholder="Start typing an address..."
                        style={sharedStyles.input}
                    />
                    {addrError && (
                        <div style={{ color: colors.status.error, fontSize: 12, marginTop: 4 }}>
                            {addrError}
                        </div>
                    )}

                    {/* Autocomplete dropdown */}
                    {addrOpen && addrSuggestions.length > 0 && (
                        <div
                            ref={dropdownRef}
                            style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                background: colors.bg.primary,
                                border: `1px solid ${colors.border.light}`,
                                borderRadius: borderRadius.md,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                zIndex: 1001,
                                maxHeight: 250,
                                overflowY: "auto",
                            }}
                        >
                            {addrSuggestions.map((item: any, idx: number) => (
                                <div
                                    key={item.place_id || idx}
                                    onClick={() => handleSelectSuggestion(item)}
                                    style={{
                                        padding: "10px 12px",
                                        cursor: "pointer",
                                        borderBottom: idx < addrSuggestions.length - 1 ? `1px solid ${colors.border.light}` : undefined,
                                        fontSize: 14,
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.secondary; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg.primary; }}
                                >
                                    <div style={{ fontWeight: 500 }}>{item.main_text || item.display_name}</div>
                                    {item.secondary_text && (
                                        <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                                            {item.secondary_text}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Coordinates display */}
                {(lat != null && lng != null) && (
                    <div style={{ marginBottom: 16, padding: 12, background: colors.bg.secondary, borderRadius: borderRadius.md, fontSize: 13, color: colors.text.secondary }}>
                        📍 {lat.toFixed(6)}, {lng.toFixed(6)}
                        {selectedPlaceId && <span style={{ marginLeft: 8, fontSize: 11 }}>({selectedPlaceId})</span>}
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
                        style={{ ...sharedStyles.secondaryButton, padding: `${spacing['10']} ${spacing['14']}` }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        style={{ ...sharedStyles.primaryButton, padding: `${spacing['10']} ${spacing['14']}` }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

export function StoresTab({ setError }: { setError: (msg: string | null) => void }) {
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [sortBy, setSortBy] = useState<"name" | "province" | "updated">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [totalStores, setTotalStores] = useState(0);
    const limit = 20;

    const extractProvince = (store: Store): string => {
        if (store.addr_city || store.addr_state || store.addr_district) {
            const parts = [
                store.addr_district,
                store.addr_city || store.addr_state
            ].filter(Boolean);
            return parts.join(", ") || "-";
        }

        if (!store.address_full) return "-";
        const parts = store.address_full.split(",").map(p => p.trim());
        if (parts.length >= 2) {
            return parts.slice(-2).join(", ");
        }
        return parts[parts.length - 1] || "-";
    };

    const fetchStores = async (q = "", p = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/stores?q=${encodeURIComponent(q)}&page=${p}&limit=${limit}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setStores(data.stores);
            setTotalStores(data.total || 0);
        } catch (err: any) {
            setError(err.message || "Failed to fetch stores");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStores(search, page);
    }, [search, page]);

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
            <div style={{ display: "flex", gap: spacing['12'], marginBottom: spacing['16'] }}>
                <input
                    type="text"
                    placeholder="Search stores..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    style={{
                        flex: 1,
                        padding: `${spacing['8']} ${spacing['12']}`,
                        background: colors.bg.secondary,
                        border: `1px solid ${colors.border.light}`,
                        borderRadius: borderRadius.base,
                        color: colors.text.primary,
                        fontSize: typography.fontSize.base,
                    }}
                />
                <button
                    onClick={handleCreate}
                    style={{
                        padding: `${spacing['8']} ${spacing['16']}`,
                        background: colors.interactive.primary,
                        border: `1px solid ${colors.interactive.primary}`,
                        borderRadius: borderRadius.base,
                        color: colors.text.inverse,
                        cursor: "pointer",
                        fontWeight: typography.fontWeight.semibold,
                    }}
                >
                    + Create Store
                </button>
            </div>

            {loading ? (
                <div style={{ padding: spacing['24'], textAlign: "center", color: colors.text.secondary }}>Loading...</div>
            ) : stores.length === 0 ? (
                <div style={{ padding: spacing['24'], textAlign: "center", color: colors.text.secondary }}>No stores found</div>
            ) : (
                <div style={{ overflowX: "auto", background: colors.bg.secondary, border: `1px solid ${colors.border.light}`, borderRadius: borderRadius.md }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${colors.border.light}`, background: colors.bg.tertiary }}>
                                <th
                                    onClick={() => handleSort("name")}
                                    style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, cursor: "pointer", userSelect: "none", fontSize: typography.fontSize.sm }}
                                >
                                    Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                                <th style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>Address</th>
                                <th
                                    onClick={() => handleSort("province")}
                                    style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, cursor: "pointer", userSelect: "none", fontSize: typography.fontSize.sm }}
                                >
                                    Province/Region {sortBy === "province" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                                <th style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>Active</th>
                                <th
                                    onClick={() => handleSort("updated")}
                                    style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, cursor: "pointer", userSelect: "none", fontSize: typography.fontSize.sm }}
                                >
                                    Updated {sortBy === "updated" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                                <th style={{ padding: spacing['12'], textAlign: "left", color: colors.text.secondary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStores.map((store) => {
                                let displayAddress = store.addr_line1 || store.address_full || "-";
                                if (displayAddress !== "-" && displayAddress.toLowerCase().startsWith(store.name.toLowerCase())) {
                                    displayAddress = displayAddress.substring(store.name.length).replace(/^[\s,-]+/, "");
                                    if (!displayAddress) displayAddress = store.address_full || "-";
                                }

                                return (
                                    <tr key={store.id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                                        <td style={{ padding: spacing['12'], color: colors.text.primary }}>{store.name}</td>
                                        <td style={{ padding: spacing['12'], color: colors.text.secondary, fontSize: typography.fontSize.sm, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {displayAddress}
                                        </td>
                                        <td style={{ padding: spacing['12'], color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
                                            {extractProvince(store)}
                                        </td>
                                        <td style={{ padding: spacing['12'] }}>
                                            <span
                                                style={{
                                                    padding: `${spacing['4']} ${spacing['8']}`,
                                                    borderRadius: borderRadius.sm,
                                                    fontSize: typography.fontSize.xs,
                                                    background: store.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)',
                                                    color: store.is_active ? colors.status.success : colors.text.tertiary,
                                                }}
                                            >
                                                {store.is_active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td style={{ padding: spacing['12'], color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                                            {new Date(store.updated_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: spacing['12'] }}>
                                            <button
                                                onClick={() => handleEdit(store)}
                                                style={{
                                                    padding: `${spacing['4']} ${spacing['12']}`,
                                                    background: colors.bg.secondary,
                                                    border: `1px solid ${colors.border.light}`,
                                                    borderRadius: borderRadius.base,
                                                    color: colors.text.primary,
                                                    cursor: "pointer",
                                                    fontSize: typography.fontSize.sm,
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

            {/* Pagination Controls */}
            {!loading && totalStores > limit && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalStores)} of {totalStores} entries
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}`, opacity: page === 1 ? 0.5 : 1 }}
                        >
                            Previous
                        </button>
                        <button
                            disabled={page * limit >= totalStores}
                            onClick={() => setPage(p => p + 1)}
                            style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}`, opacity: page * limit >= totalStores ? 0.5 : 1 }}
                        >
                            Next
                        </button>
                    </div>
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
