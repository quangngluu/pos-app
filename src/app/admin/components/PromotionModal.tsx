"use client";

import { useState, useEffect } from "react";
import { colors, spacing, typography, borderRadius, shadows } from "@/app/lib/designTokens";

export type Promotion = {
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
    scopes?: string[];
    // flexible fields returning from get
    scope_targets?: any[];
    rules?: any[];
};

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

    // --- Step 3: Actions ---
    const [actionType, setActionType] = useState<"PERCENT_OFF" | "AMOUNT_OFF_PER_ITEM" | "AMOUNT_OFF">("PERCENT_OFF");
    const [discountValue, setDiscountValue] = useState("");

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

        let actions: any[] = [];
        if (discountValue) {
            if (actionType === "PERCENT_OFF") {
                actions.push({ type: "PERCENT_OFF", percent: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES" });
            } else if (actionType === "AMOUNT_OFF") {
                actions.push({ type: "AMOUNT_OFF", amount: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES", allocation: "PROPORTIONAL" });
            } else if (actionType === "AMOUNT_OFF_PER_ITEM") {
                actions.push({ type: "AMOUNT_OFF_PER_ITEM", amount: parseFloat(discountValue) });
            }
        }

        const payload: any = {
            name: name.trim(),
            promo_type: "DISCOUNT", // Enforce DISCOUNT for builders
            priority: parseInt(priority) || 0,
            is_stackable: isStackable,
            is_active: isActive,
            start_at: startAt || null,
            end_at: endAt || null,
            percent_off: actionType === "PERCENT_OFF" && discountValue ? parseFloat(discountValue) : null, // legacy sync
            min_qty: minQty ? parseInt(minQty) : null, // legacy sync
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
                            </div>
                        </div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Action (Mức khuyến mãi)</h3>
                            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="PERCENT_OFF" checked={actionType === "PERCENT_OFF"} onChange={() => setActionType("PERCENT_OFF")} /> Giảm %</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="AMOUNT_OFF" checked={actionType === "AMOUNT_OFF"} onChange={() => setActionType("AMOUNT_OFF")} /> Giảm số tiền Cố định</label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="radio" value="AMOUNT_OFF_PER_ITEM" checked={actionType === "AMOUNT_OFF_PER_ITEM"} onChange={() => setActionType("AMOUNT_OFF_PER_ITEM")} /> Giảm tiền trên mỗi SP</label>
                            </div>

                            <div>
                                <label style={sharedStyles.label}>Giá trị Giảm ({actionType === "PERCENT_OFF" ? "%" : "VNĐ"})</label>
                                <input type="number" placeholder="VD: 15" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={sharedStyles.input} />
                            </div>
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
