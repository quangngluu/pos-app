"use client";

import { useState, useEffect } from "react";
import { colors, spacing, typography, borderRadius, shadows } from "@/app/lib/designTokens";
import type { Promotion } from "@/app/lib/promotions/types";

const sharedStyles = {
    input: {
        width: "100%",
        padding: `${spacing['10']} ${spacing['12']}`,
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.primary,
        fontSize: typography.fontSize.base,
    },
    disabledInput: {
        width: "100%",
        padding: `${spacing['10']} ${spacing['12']}`,
        background: colors.bg.tertiary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.tertiary,
        fontSize: typography.fontSize.base,
        cursor: "not-allowed",
    },
    primaryButton: {
        padding: `${spacing['10']} ${spacing['16']}`,
        background: colors.interactive.primary,
        border: `1px solid ${colors.interactive.primary}`,
        borderRadius: borderRadius.md,
        color: colors.text.inverse,
        cursor: "pointer",
        fontWeight: typography.fontWeight.semibold,
    },
    secondaryButton: {
        padding: `${spacing['10']} ${spacing['16']}`,
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.primary,
        cursor: "pointer",
        fontWeight: typography.fontWeight.medium,
    },
    modalCard: {
        background: colors.bg.primary,
        padding: spacing['24'],
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.lg,
        maxHeight: "90vh",
        overflowY: "auto" as const,
    },
    label: {
        display: "block",
        marginBottom: 4,
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
};

type Step = 1 | 2 | 3;

export function PromotionModal({
    promotion,
    onClose,
    onSave,
}: {
    promotion: Promotion | null;
    onClose: () => void;
    onSave: (payload: any) => void;
}) {
    const [step, setStep] = useState<Step>(1);
    const [loading, setLoading] = useState(false);

    // --- Step 1: Base & Scope ---
    const [code, setCode] = useState(promotion?.code || "");
    const [name, setName] = useState(promotion?.name || "");
    const [priority, setPriority] = useState(promotion?.priority?.toString() || "0");
    const [isActive, setIsActive] = useState(promotion?.is_active ?? true);
    const [isStackable, setIsStackable] = useState(promotion?.is_stackable ?? false);
    const [startAt, setStartAt] = useState(promotion?.start_at || "");
    const [endAt, setEndAt] = useState(promotion?.end_at || "");

    const [scopeType, setScopeType] = useState<"ALL" | "CATEGORY" | "PRODUCT">("ALL");
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

    // Data for selectors
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // --- Step 2: Conditions ---
    const [minQty, setMinQty] = useState("");
    const [minEligibleQty, setMinEligibleQty] = useState("");
    const [minOrderValue, setMinOrderValue] = useState("");
    // Phase 2: new condition fields
    const [timeRangeStart, setTimeRangeStart] = useState("");
    const [timeRangeEnd, setTimeRangeEnd] = useState("");
    const [dayOfWeek, setDayOfWeek] = useState<Set<number>>(new Set());
    const [dateRangeStart, setDateRangeStart] = useState("");
    const [dateRangeEnd, setDateRangeEnd] = useState("");

    // --- Step 3: Actions ---
    type ActionTypeKey = "PERCENT_OFF" | "AMOUNT_OFF_PER_ITEM" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "NTH_ITEM_DISCOUNT" | "TIERED_PERCENT";
    const [actionType, setActionType] = useState<ActionTypeKey>("PERCENT_OFF");
    const [discountValue, setDiscountValue] = useState("");
    // Phase 2: BUY_X_GET_Y fields
    const [buyQty, setBuyQty] = useState("2");
    const [getQty, setGetQty] = useState("1");
    const [getDiscountPercent, setGetDiscountPercent] = useState("100");
    // Phase 2: NTH_ITEM_DISCOUNT fields
    const [nthItem, setNthItem] = useState("2");
    const [nthPercent, setNthPercent] = useState("50");
    // Phase 2: TIERED_PERCENT fields
    const [tiers, setTiers] = useState<{ min_value: string; percent: string }[]>([{ min_value: "100000", percent: "5" }, { min_value: "200000", percent: "10" }]);

    // Load backend details
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch products for the product picker and category extractor
                const prodRes = await fetch("/api/admin/products");
                const prodData = await prodRes.json();
                let loadedProducts: any[] = [];
                if (prodData.ok) {
                    loadedProducts = prodData.products;
                    setProducts(loadedProducts);
                    const cats = Array.from(new Set(loadedProducts.map(p => p.category).filter(c => c))).sort();
                    setCategories(cats as string[]);
                }

                // If editing, load flexible rules and scopes from DB
                if (promotion) {
                    const [rulesRes, scopesRes] = await Promise.all([
                        fetch(`/api/admin/promotions/rules?promotion_code=${promotion.code}`),
                        fetch(`/api/admin/promotions/scopes?promotion_code=${promotion.code}`)
                    ]);

                    const rulesData = await rulesRes.json();
                    const scopesData = await scopesRes.json();

                    if (scopesData.ok && scopesData.scopes.length > 0) {
                        const hasCat = scopesData.scopes.some((s: any) => s.target_type === "CATEGORY");
                        const hasProd = scopesData.scopes.some((s: any) => s.target_type === "PRODUCT");

                        if (hasProd) {
                            setScopeType("PRODUCT");
                            setSelectedProducts(new Set(scopesData.scopes.filter((s: any) => s.target_type === "PRODUCT").map((s: any) => s.target_id)));
                        } else if (hasCat) {
                            setScopeType("CATEGORY");
                            setSelectedCategories(new Set(scopesData.scopes.filter((s: any) => s.target_type === "CATEGORY").map((s: any) => s.target_id)));
                        } else {
                            setScopeType("ALL");
                        }
                    } else if (promotion.scopes && promotion.scopes.length > 0) {
                        // Legacy fallback
                        setScopeType("CATEGORY");
                        setSelectedCategories(new Set(promotion.scopes));
                    } else {
                        setScopeType("ALL");
                    }

                    if (rulesData.ok && rulesData.rules.length > 0) {
                        const rule = rulesData.rules[0];
                        if (rule.conditions) {
                            setMinQty(rule.conditions.min_qty?.toString() || "");
                            setMinEligibleQty(rule.conditions.min_eligible_qty?.toString() || "");
                            setMinOrderValue(rule.conditions.min_order_value?.toString() || "");
                        }
                        if (rule.actions && rule.actions.length > 0) {
                            const action = rule.actions[0];
                            setActionType(action.type);
                            if (action.type === "PERCENT_OFF") setDiscountValue(action.percent.toString());
                            else if (action.type === "AMOUNT_OFF" || action.type === "AMOUNT_OFF_PER_ITEM") setDiscountValue(action.amount.toString());
                            else if (action.type === "BUY_X_GET_Y") {
                                setBuyQty(action.buy_qty?.toString() || "2");
                                setGetQty(action.get_qty?.toString() || "1");
                                setGetDiscountPercent(action.get_discount_percent?.toString() || "100");
                            } else if (action.type === "NTH_ITEM_DISCOUNT") {
                                setNthItem(action.nth?.toString() || "2");
                                setNthPercent(action.percent?.toString() || "50");
                            } else if (action.type === "TIERED_PERCENT") {
                                if (action.tiers) setTiers(action.tiers.map((t: any) => ({ min_value: t.min_value.toString(), percent: t.percent.toString() })));
                            }
                        }
                        // Phase 2: load new condition types
                        if (rule.conditions?.time_range) {
                            setTimeRangeStart(rule.conditions.time_range.start || "");
                            setTimeRangeEnd(rule.conditions.time_range.end || "");
                        }
                        if (rule.conditions?.day_of_week) {
                            setDayOfWeek(new Set(rule.conditions.day_of_week.days || []));
                        }
                        if (rule.conditions?.date_range) {
                            setDateRangeStart(rule.conditions.date_range.start || "");
                            setDateRangeEnd(rule.conditions.date_range.end || "");
                        }
                    } else {
                        // Legacy fallback
                        if (promotion.min_qty) setMinQty(promotion.min_qty.toString());
                        if (promotion.percent_off) {
                            setActionType("PERCENT_OFF");
                            setDiscountValue(promotion.percent_off.toString());
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load promotion details", e);
            }
            setLoading(false);
        };
        fetchData();
    }, [promotion]);

    const toggleCategory = (cat: string) => {
        const next = new Set(selectedCategories);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        setSelectedCategories(next);
    };

    const toggleProduct = (prodId: string) => {
        const next = new Set(selectedProducts);
        if (next.has(prodId)) next.delete(prodId);
        else next.add(prodId);
        setSelectedProducts(next);
    };

    const handleNext = () => setStep(step + 1 as Step);
    const handleBack = () => setStep(step - 1 as Step);

    const handleSubmit = () => {
        if (!code.trim() || !name.trim()) {
            alert("Code and Name are required");
            return;
        }

        // Build payload mapping back to route schemas
        const scope_targets: any[] = [];
        if (scopeType === "CATEGORY") {
            selectedCategories.forEach(cat => scope_targets.push({ target_type: "CATEGORY", target_id: cat }));
        } else if (scopeType === "PRODUCT") {
            selectedProducts.forEach(pid => scope_targets.push({ target_type: "PRODUCT", target_id: pid }));
        }

        const conditions: any = {};
        if (minQty) conditions.min_qty = parseInt(minQty);
        if (minEligibleQty) conditions.min_eligible_qty = parseInt(minEligibleQty);
        if (minOrderValue) conditions.min_order_value = parseInt(minOrderValue);
        // Phase 2 conditions
        if (timeRangeStart && timeRangeEnd) conditions.time_range = { start: timeRangeStart, end: timeRangeEnd };
        if (dayOfWeek.size > 0) conditions.day_of_week = { days: Array.from(dayOfWeek).sort() };
        if (dateRangeStart && dateRangeEnd) conditions.date_range = { start: dateRangeStart, end: dateRangeEnd };

        let actions: any[] = [];
        if (actionType === "PERCENT_OFF" && discountValue) {
            actions.push({ type: "PERCENT_OFF", percent: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES" });
        } else if (actionType === "AMOUNT_OFF" && discountValue) {
            actions.push({ type: "AMOUNT_OFF", amount: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES", allocation: "PROPORTIONAL" });
        } else if (actionType === "AMOUNT_OFF_PER_ITEM" && discountValue) {
            actions.push({ type: "AMOUNT_OFF_PER_ITEM", amount: parseFloat(discountValue) });
        } else if (actionType === "BUY_X_GET_Y") {
            actions.push({ type: "BUY_X_GET_Y", buy_qty: parseInt(buyQty) || 2, get_qty: parseInt(getQty) || 1, get_discount_percent: parseInt(getDiscountPercent) || 100 });
        } else if (actionType === "NTH_ITEM_DISCOUNT") {
            actions.push({ type: "NTH_ITEM_DISCOUNT", nth: parseInt(nthItem) || 2, percent: parseInt(nthPercent) || 50 });
        } else if (actionType === "TIERED_PERCENT") {
            const parsedTiers = tiers.filter(t => t.min_value && t.percent).map(t => ({ min_value: parseInt(t.min_value), percent: parseInt(t.percent) }));
            if (parsedTiers.length > 0) actions.push({ type: "TIERED_PERCENT", tiers: parsedTiers, apply_to: "ELIGIBLE_LINES" });
        }

        const payload: any = {
            name: name.trim(),
            promo_type: "DISCOUNT",
            priority: parseInt(priority) || 0,
            is_stackable: isStackable,
            is_active: isActive,
            start_at: startAt || null,
            end_at: endAt || null,
            percent_off: actionType === "PERCENT_OFF" && discountValue ? parseFloat(discountValue) : null,
            min_qty: minQty ? parseInt(minQty) : null,
            scope_targets,
            rules: [{ rule_order: 0, conditions: Object.keys(conditions).length ? conditions : null, actions }]
        };

        if (promotion) {
            onSave(payload); // Patch
        } else {
            payload.code = code.trim();
            onSave(payload); // Post
        }
    };

    if (loading) {
        return (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: colors.bg.primary, padding: 24, borderRadius: 8 }}>Loading...</div>
            </div>
        );
    }

    return (
        <div
            style={{
                position: "fixed",
                top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(15,23,42,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ ...sharedStyles.modalCard, width: "90%", maxWidth: 800, minHeight: 400, display: "flex", flexDirection: "column" }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 600 }}>
                        {promotion ? "Edit Promotion" : "Create Promotion"} - Step {step} of 3
                    </h2>
                    <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: colors.text.secondary }}>✕</button>
                </div>

                <div style={{ flex: 1 }}>
                    {/* STEP 1 */}
                    {step === 1 && (
                        <div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                                <div>
                                    <label style={sharedStyles.label}>Code *</label>
                                    <input type="text" value={code} onChange={e => setCode(e.target.value)} disabled={!!promotion} style={promotion ? sharedStyles.disabledInput : sharedStyles.input} />
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Name *</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} style={sharedStyles.input} />
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Priority</label>
                                    <input type="number" value={priority} onChange={e => setPriority(e.target.value)} style={sharedStyles.input} />
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Time Window (Optional)</label>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} style={sharedStyles.input} />
                                        <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} style={sharedStyles.input} />
                                    </div>
                                </div>
                                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active</label>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={isStackable} onChange={e => setIsStackable(e.target.checked)} /> Stackable</label>
                                </div>
                            </div>

                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, borderTop: `1px solid ${colors.border.light}`, paddingTop: 16 }}>Scope (Áp dụng cho sản phẩm nào)</h3>
                            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="ALL" checked={scopeType === "ALL"} onChange={() => setScopeType("ALL")} /> Toàn bộ menu</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="CATEGORY" checked={scopeType === "CATEGORY"} onChange={() => setScopeType("CATEGORY")} /> Theo Category</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="PRODUCT" checked={scopeType === "PRODUCT"} onChange={() => setScopeType("PRODUCT")} /> Theo Sản phẩm Cụ thể</label>
                            </div>

                            {scopeType === "CATEGORY" && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: colors.bg.secondary, borderRadius: 8 }}>
                                    {categories.map(cat => (
                                        <button key={cat} onClick={() => toggleCategory(cat)} style={{ padding: "6px 12px", border: `1px solid ${selectedCategories.has(cat) ? colors.interactive.primary : colors.border.light}`, background: selectedCategories.has(cat) ? colors.interactive.primary : colors.bg.primary, color: selectedCategories.has(cat) ? colors.text.inverse : colors.text.primary, borderRadius: 4, cursor: "pointer" }}>
                                            {selectedCategories.has(cat) ? "✓ " : ""}{cat}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {scopeType === "PRODUCT" && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, padding: 12, background: colors.bg.secondary, borderRadius: 8, maxHeight: 250, overflowY: "auto" }}>
                                    {products.map(p => (
                                        <div key={p.id} onClick={() => toggleProduct(p.id)} style={{ padding: 8, background: selectedProducts.has(p.id) ? colors.status.infoLight : colors.bg.primary, border: `1px solid ${selectedProducts.has(p.id) ? colors.interactive.primary : colors.border.light}`, borderRadius: 4, cursor: "pointer", fontSize: 13, textAlign: "center" }}>
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Conditions (Điều kiện áp dụng)</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                                <div>
                                    <label style={sharedStyles.label}>Min Order Value (Tổng đơn tối thiểu - VNĐ)</label>
                                    <input type="number" placeholder="VD: 50000" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} style={sharedStyles.input} />
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Min Total Qty (Tổng số ly tối thiểu trong đơn)</label>
                                    <input type="number" placeholder="VD: 5" value={minQty} onChange={e => setMinQty(e.target.value)} style={sharedStyles.input} />
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Min Eligible Qty (Số ly tối thiểu của Món Được Chọn)</label>
                                    <input type="number" placeholder="VD: 2" value={minEligibleQty} onChange={e => setMinEligibleQty(e.target.value)} style={sharedStyles.input} />
                                    <span style={{ fontSize: 12, color: colors.text.secondary }}>Chỉ hữu ích nếu áp dụng theo Nhóm Món. VD: Mua 2 ly Trà Sữa để được giảm.</span>
                                </div>

                                {/* Phase 2: Time-based conditions */}
                                <div style={{ borderTop: `1px solid ${colors.border.light}`, paddingTop: 16 }}>
                                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: colors.text.secondary }}>⏰ Điều kiện Thời gian (Tùy chọn)</h4>
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Khung giờ (Happy Hour)</label>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <input type="time" value={timeRangeStart} onChange={e => setTimeRangeStart(e.target.value)} style={{ ...sharedStyles.input, width: "auto" }} />
                                        <span style={{ color: colors.text.secondary }}>→</span>
                                        <input type="time" value={timeRangeEnd} onChange={e => setTimeRangeEnd(e.target.value)} style={{ ...sharedStyles.input, width: "auto" }} />
                                    </div>
                                    <span style={{ fontSize: 12, color: colors.text.secondary }}>VD: 14:00 → 17:00 cho Happy Hour buổi chiều</span>
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Ngày trong tuần</label>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((label, idx) => (
                                            <button key={idx} onClick={() => { const next = new Set(dayOfWeek); next.has(idx) ? next.delete(idx) : next.add(idx); setDayOfWeek(next); }}
                                                style={{ padding: "6px 12px", border: `1px solid ${dayOfWeek.has(idx) ? colors.interactive.primary : colors.border.light}`, background: dayOfWeek.has(idx) ? colors.interactive.primary : colors.bg.primary, color: dayOfWeek.has(idx) ? colors.text.inverse : colors.text.primary, borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={sharedStyles.label}>Khoảng ngày áp dụng</label>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <input type="date" value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} style={{ ...sharedStyles.input, width: "auto" }} />
                                        <span style={{ color: colors.text.secondary }}>→</span>
                                        <input type="date" value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} style={{ ...sharedStyles.input, width: "auto" }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Action (Mức khuyến mãi)</h3>
                            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="PERCENT_OFF" checked={actionType === "PERCENT_OFF"} onChange={() => setActionType("PERCENT_OFF")} /> Giảm %</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="AMOUNT_OFF" checked={actionType === "AMOUNT_OFF"} onChange={() => setActionType("AMOUNT_OFF")} /> Giảm tiền CĐ</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="AMOUNT_OFF_PER_ITEM" checked={actionType === "AMOUNT_OFF_PER_ITEM"} onChange={() => setActionType("AMOUNT_OFF_PER_ITEM")} /> Giảm/SP</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="BUY_X_GET_Y" checked={actionType === "BUY_X_GET_Y"} onChange={() => setActionType("BUY_X_GET_Y")} /> Mua X Tặng Y</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="NTH_ITEM_DISCOUNT" checked={actionType === "NTH_ITEM_DISCOUNT"} onChange={() => setActionType("NTH_ITEM_DISCOUNT")} /> Ly thứ N giảm</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}><input type="radio" value="TIERED_PERCENT" checked={actionType === "TIERED_PERCENT"} onChange={() => setActionType("TIERED_PERCENT")} /> Giảm bậc thang</label>
                            </div>

                            {/* Original action types */}
                            {(actionType === "PERCENT_OFF" || actionType === "AMOUNT_OFF" || actionType === "AMOUNT_OFF_PER_ITEM") && (
                                <div>
                                    <label style={sharedStyles.label}>Giá trị Giảm ({actionType === "PERCENT_OFF" ? "%" : "VNĐ"})</label>
                                    <input type="number" placeholder="VD: 15" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={sharedStyles.input} />
                                </div>
                            )}

                            {/* BUY_X_GET_Y */}
                            {actionType === "BUY_X_GET_Y" && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={sharedStyles.label}>Mua (số lượng)</label>
                                        <input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)} style={sharedStyles.input} />
                                    </div>
                                    <div>
                                        <label style={sharedStyles.label}>Tặng (số lượng)</label>
                                        <input type="number" value={getQty} onChange={e => setGetQty(e.target.value)} style={sharedStyles.input} />
                                    </div>
                                    <div>
                                        <label style={sharedStyles.label}>% Giảm cho món tặng</label>
                                        <input type="number" value={getDiscountPercent} onChange={e => setGetDiscountPercent(e.target.value)} style={sharedStyles.input} />
                                        <span style={{ fontSize: 12, color: colors.text.secondary }}>100 = miễn phí, 50 = giảm nửa giá</span>
                                    </div>
                                </div>
                            )}

                            {/* NTH_ITEM_DISCOUNT */}
                            {actionType === "NTH_ITEM_DISCOUNT" && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <label style={sharedStyles.label}>Ly thứ mấy?</label>
                                        <input type="number" value={nthItem} onChange={e => setNthItem(e.target.value)} style={sharedStyles.input} />
                                        <span style={{ fontSize: 12, color: colors.text.secondary }}>VD: 2 = ly thứ 2</span>
                                    </div>
                                    <div>
                                        <label style={sharedStyles.label}>Giảm bao nhiêu %?</label>
                                        <input type="number" value={nthPercent} onChange={e => setNthPercent(e.target.value)} style={sharedStyles.input} />
                                        <span style={{ fontSize: 12, color: colors.text.secondary }}>VD: 50 = giảm 50%</span>
                                    </div>
                                </div>
                            )}

                            {/* TIERED_PERCENT */}
                            {actionType === "TIERED_PERCENT" && (
                                <div>
                                    <label style={sharedStyles.label}>Bậc giảm giá (thêm bậc bằng nút bên dưới)</label>
                                    {tiers.map((tier, idx) => (
                                        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                                            <span style={{ fontSize: 13, color: colors.text.secondary, minWidth: 20 }}>#{idx + 1}</span>
                                            <input type="number" placeholder="Giá trị tối thiểu" value={tier.min_value} onChange={e => { const next = [...tiers]; next[idx] = { ...next[idx], min_value: e.target.value }; setTiers(next); }} style={{ ...sharedStyles.input, width: "auto", flex: 1 }} />
                                            <span style={{ fontSize: 13, color: colors.text.secondary }}>→</span>
                                            <input type="number" placeholder="% giảm" value={tier.percent} onChange={e => { const next = [...tiers]; next[idx] = { ...next[idx], percent: e.target.value }; setTiers(next); }} style={{ ...sharedStyles.input, width: "auto", flex: 1 }} />
                                            <span style={{ fontSize: 12, color: colors.text.secondary }}>%</span>
                                            {tiers.length > 1 && (
                                                <button onClick={() => setTiers(tiers.filter((_, i) => i !== idx))} style={{ background: "transparent", border: "none", color: colors.text.secondary, cursor: "pointer", fontSize: 16 }}>✕</button>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => setTiers([...tiers, { min_value: "", percent: "" }])} style={{ ...sharedStyles.secondaryButton, padding: "6px 12px", fontSize: 13 }}>+ Thêm bậc</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${colors.border.light}` }}>
                    <button onClick={step === 1 ? onClose : handleBack} style={sharedStyles.secondaryButton}>{step === 1 ? "Cancel" : "Back"}</button>
                    <button onClick={step === 3 ? handleSubmit : handleNext} style={sharedStyles.primaryButton}>{step === 3 ? "Save Promotion" : "Next"}</button>
                </div>
            </div>
        </div>
    );
}
