"use client";

import { useState, useEffect } from "react";
import { colors, spacing, typography, borderRadius, shadows } from "@/app/lib/designTokens";
import { sharedStyles } from "./shared";
import { Drawer } from "@/app/components/Drawer";
import type { Promotion } from "@/app/lib/promotions/types";

/* ============================================================
   Promotion Manager — Single-page, UX-optimized form
   
   UX best practices applied:
   - Single-column layout (vertical scan path)
   - Labels always above inputs (never placeholder-as-label)
   - Grouped related fields with clear section headers
   - Input widths match expected content length  
   - Required fields marked with *
   - Descriptive submit button text
   - Progressive disclosure for advanced options
   - Inline helper text under fields (not placeholder)
   - Consistent 16px vertical rhythm between field groups
============================================================ */

type ActionTypeKey =
    | "PERCENT_OFF" | "AMOUNT_OFF" | "AMOUNT_OFF_PER_ITEM"
    | "BUY_X_GET_Y" | "NTH_ITEM_DISCOUNT" | "TIERED_PERCENT";

/* ---- Reusable field component ---- */

function Field({ label, hint, required, children, width }: {
    label: string; hint?: string; required?: boolean; children: React.ReactNode; width?: string | number;
}) {
    return (
        <div style={{ marginBottom: 16, maxWidth: width }}>
            <label style={{
                display: "block",
                marginBottom: 5,
                fontSize: typography.fontSize.sm,
                color: colors.text.primary,
                fontWeight: typography.fontWeight.medium,
            }}>
                {label}{required && <span style={{ color: colors.status.error, marginLeft: 2 }}>*</span>}
            </label>
            {children}
            {hint && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.text.tertiary, lineHeight: 1.4 }}>{hint}</p>
            )}
        </div>
    );
}

/* ---- Style constants ---- */

const input: React.CSSProperties = {
    width: "100%",
    padding: `${spacing["8"]} ${spacing["12"]}`,
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    lineHeight: 1.5,
};

const disabledInput: React.CSSProperties = {
    ...input,
    background: colors.bg.tertiary,
    color: colors.text.tertiary,
    cursor: "not-allowed",
};

const sectionBox: React.CSSProperties = {
    background: colors.bg.primary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.lg,
    padding: `${spacing["20"]} ${spacing["24"]}`,
    marginBottom: spacing["16"],
};

const sectionTitle: React.CSSProperties = {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: "0 0 4px",
};

const sectionDesc: React.CSSProperties = {
    fontSize: 13,
    color: colors.text.tertiary,
    margin: "0 0 20px",
    lineHeight: 1.4,
};

const chipButton = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    border: `1.5px solid ${active ? colors.interactive.primary : colors.border.light}`,
    background: active ? colors.status.infoLight : colors.bg.primary,
    color: active ? colors.interactive.primary : colors.text.primary,
    borderRadius: borderRadius.md,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    transition: "all 0.15s ease",
});

const miniChip = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    border: `1.5px solid ${active ? colors.interactive.primary : colors.border.light}`,
    background: active ? colors.interactive.primary : colors.bg.primary,
    color: active ? colors.text.inverse : colors.text.primary,
    borderRadius: borderRadius.md,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
});

const inlineRow: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
};

export function PromotionsTab({ setError }: { setError: (msg: string | null) => void }) {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [saving, setSaving] = useState(false);

    const [editing, setEditing] = useState<Promotion | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Form — basic
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [priority, setPriority] = useState("0");
    const [isActive, setIsActive] = useState(true);
    const [isStackable, setIsStackable] = useState(false);
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");

    // Form — scope
    const [scopeType, setScopeType] = useState<"ALL" | "CATEGORY" | "PRODUCT">("ALL");
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // Form — conditions
    const [minQty, setMinQty] = useState("");
    const [minEligibleQty, setMinEligibleQty] = useState("");
    const [minOrderValue, setMinOrderValue] = useState("");
    const [timeRangeStart, setTimeRangeStart] = useState("");
    const [timeRangeEnd, setTimeRangeEnd] = useState("");
    const [dayOfWeek, setDayOfWeek] = useState<Set<number>>(new Set());
    const [dateRangeStart, setDateRangeStart] = useState("");
    const [dateRangeEnd, setDateRangeEnd] = useState("");

    // Form — actions
    const [actionType, setActionType] = useState<ActionTypeKey>("PERCENT_OFF");
    const [discountValue, setDiscountValue] = useState("");
    const [buyQty, setBuyQty] = useState("2");
    const [getQty, setGetQty] = useState("1");
    const [getDiscountPercent, setGetDiscountPercent] = useState("100");
    const [nthItem, setNthItem] = useState("2");
    const [nthPercent, setNthPercent] = useState("50");
    const [tiers, setTiers] = useState<{ min_value: string; percent: string }[]>([
        { min_value: "100000", percent: "5" },
        { min_value: "200000", percent: "10" },
    ]);

    /* ---- Data loading ---- */

    const fetchPromotions = async (q = "") => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/admin/promotions?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setPromotions(data.promotions);
        } catch (err: any) { setError(err.message || "Lỗi khi tải"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchPromotions(search); }, [search]);

    const resetForm = () => {
        setCode(""); setName(""); setPriority("0"); setIsActive(true); setIsStackable(false);
        setStartAt(""); setEndAt("");
        setScopeType("ALL"); setSelectedCategories(new Set()); setSelectedProducts(new Set());
        setMinQty(""); setMinEligibleQty(""); setMinOrderValue("");
        setTimeRangeStart(""); setTimeRangeEnd(""); setDayOfWeek(new Set()); setDateRangeStart(""); setDateRangeEnd("");
        setActionType("PERCENT_OFF"); setDiscountValue("");
        setBuyQty("2"); setGetQty("1"); setGetDiscountPercent("100");
        setNthItem("2"); setNthPercent("50");
        setTiers([{ min_value: "100000", percent: "5" }, { min_value: "200000", percent: "10" }]);
        setShowAdvanced(false);
    };

    const loadProducts = async () => {
        try {
            const prodRes = await fetch("/api/admin/products");
            const prodData = await prodRes.json();
            if (prodData.ok) {
                setProducts(prodData.products);
                setCategories(Array.from(new Set(prodData.products.map((p: any) => p.category).filter((c: any) => c))).sort() as string[]);
            }
        } catch { }
    };

    const handleCreate = async () => {
        setEditing(null); resetForm(); setShowForm(true);
        await loadProducts();
    };

    const handleEdit = async (promo: Promotion) => {
        setEditing(promo);
        setCode(promo.code); setName(promo.name);
        setPriority(promo.priority?.toString() || "0");
        setIsActive(promo.is_active ?? true); setIsStackable(promo.is_stackable ?? false);
        setStartAt(promo.start_at || ""); setEndAt(promo.end_at || "");
        setMinQty(""); setMinEligibleQty(""); setMinOrderValue("");
        setTimeRangeStart(""); setTimeRangeEnd(""); setDayOfWeek(new Set()); setDateRangeStart(""); setDateRangeEnd("");
        setActionType("PERCENT_OFF"); setDiscountValue("");
        setScopeType("ALL"); setSelectedCategories(new Set()); setSelectedProducts(new Set());
        setShowAdvanced(false);
        setShowForm(true);

        try {
            const [prodRes, rulesRes, scopesRes] = await Promise.all([
                fetch("/api/admin/products"),
                fetch(`/api/admin/promotions/rules?promotion_code=${promo.code}`),
                fetch(`/api/admin/promotions/scopes?promotion_code=${promo.code}`),
            ]);
            const [prodData, rulesData, scopesData] = await Promise.all([prodRes.json(), rulesRes.json(), scopesRes.json()]);

            if (prodData.ok) {
                setProducts(prodData.products);
                setCategories(Array.from(new Set(prodData.products.map((p: any) => p.category).filter((c: any) => c))).sort() as string[]);
            }

            if (scopesData.ok && scopesData.scopes.length > 0) {
                const hasProd = scopesData.scopes.some((s: any) => s.target_type === "PRODUCT");
                const hasCat = scopesData.scopes.some((s: any) => s.target_type === "CATEGORY");
                if (hasProd) { setScopeType("PRODUCT"); setSelectedProducts(new Set(scopesData.scopes.filter((s: any) => s.target_type === "PRODUCT").map((s: any) => s.target_id))); }
                else if (hasCat) { setScopeType("CATEGORY"); setSelectedCategories(new Set(scopesData.scopes.filter((s: any) => s.target_type === "CATEGORY").map((s: any) => s.target_id))); }
            } else if (promo.scopes && promo.scopes.length > 0) { setScopeType("CATEGORY"); setSelectedCategories(new Set(promo.scopes)); }

            if (rulesData.ok && rulesData.rules.length > 0) {
                const rule = rulesData.rules[0];
                if (rule.conditions) {
                    setMinQty(rule.conditions.min_qty?.toString() || ""); setMinEligibleQty(rule.conditions.min_eligible_qty?.toString() || ""); setMinOrderValue(rule.conditions.min_order_value?.toString() || "");
                    if (rule.conditions.time_range) { setTimeRangeStart(rule.conditions.time_range.start || ""); setTimeRangeEnd(rule.conditions.time_range.end || ""); setShowAdvanced(true); }
                    if (rule.conditions.day_of_week) { setDayOfWeek(new Set(rule.conditions.day_of_week.days || [])); setShowAdvanced(true); }
                    if (rule.conditions.date_range) { setDateRangeStart(rule.conditions.date_range.start || ""); setDateRangeEnd(rule.conditions.date_range.end || ""); setShowAdvanced(true); }
                }
                if (rule.actions && rule.actions.length > 0) {
                    const action = rule.actions[0];
                    setActionType(action.type);
                    if (action.type === "PERCENT_OFF") setDiscountValue(action.percent.toString());
                    else if (action.type === "AMOUNT_OFF" || action.type === "AMOUNT_OFF_PER_ITEM") setDiscountValue(action.amount.toString());
                    else if (action.type === "BUY_X_GET_Y") { setBuyQty(action.buy_qty?.toString() || "2"); setGetQty(action.get_qty?.toString() || "1"); setGetDiscountPercent(action.get_discount_percent?.toString() || "100"); }
                    else if (action.type === "NTH_ITEM_DISCOUNT") { setNthItem(action.nth?.toString() || "2"); setNthPercent(action.percent?.toString() || "50"); }
                    else if (action.type === "TIERED_PERCENT" && action.tiers) setTiers(action.tiers.map((t: any) => ({ min_value: t.min_value.toString(), percent: t.percent.toString() })));
                }
            } else {
                if (promo.min_qty) setMinQty(promo.min_qty.toString());
                if (promo.percent_off) { setActionType("PERCENT_OFF"); setDiscountValue(promo.percent_off.toString()); }
            }
        } catch (e) { console.error("Failed to load promotion details", e); }
    };

    const handleSubmit = async () => {
        if (!code.trim() || !name.trim()) { alert("Code và Tên khuyến mãi là bắt buộc"); return; }

        const scope_targets: any[] = [];
        if (scopeType === "CATEGORY") selectedCategories.forEach(cat => scope_targets.push({ target_type: "CATEGORY", target_id: cat }));
        else if (scopeType === "PRODUCT") selectedProducts.forEach(pid => scope_targets.push({ target_type: "PRODUCT", target_id: pid }));

        const conditions: any = {};
        if (minQty) conditions.min_qty = parseInt(minQty);
        if (minEligibleQty) conditions.min_eligible_qty = parseInt(minEligibleQty);
        if (minOrderValue) conditions.min_order_value = parseInt(minOrderValue);
        if (timeRangeStart && timeRangeEnd) conditions.time_range = { start: timeRangeStart, end: timeRangeEnd };
        if (dayOfWeek.size > 0) conditions.day_of_week = { days: Array.from(dayOfWeek).sort() };
        if (dateRangeStart && dateRangeEnd) conditions.date_range = { start: dateRangeStart, end: dateRangeEnd };

        let actions: any[] = [];
        if (actionType === "PERCENT_OFF" && discountValue) actions.push({ type: "PERCENT_OFF", percent: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES" });
        else if (actionType === "AMOUNT_OFF" && discountValue) actions.push({ type: "AMOUNT_OFF", amount: parseFloat(discountValue), apply_to: "ELIGIBLE_LINES", allocation: "PROPORTIONAL" });
        else if (actionType === "AMOUNT_OFF_PER_ITEM" && discountValue) actions.push({ type: "AMOUNT_OFF_PER_ITEM", amount: parseFloat(discountValue) });
        else if (actionType === "BUY_X_GET_Y") actions.push({ type: "BUY_X_GET_Y", buy_qty: parseInt(buyQty) || 2, get_qty: parseInt(getQty) || 1, get_discount_percent: parseInt(getDiscountPercent) || 100 });
        else if (actionType === "NTH_ITEM_DISCOUNT") actions.push({ type: "NTH_ITEM_DISCOUNT", nth: parseInt(nthItem) || 2, percent: parseInt(nthPercent) || 50 });
        else if (actionType === "TIERED_PERCENT") { const p = tiers.filter(t => t.min_value && t.percent).map(t => ({ min_value: parseInt(t.min_value), percent: parseInt(t.percent) })); if (p.length > 0) actions.push({ type: "TIERED_PERCENT", tiers: p, apply_to: "ELIGIBLE_LINES" }); }

        const payload: any = {
            name: name.trim(), promo_type: "DISCOUNT", priority: parseInt(priority) || 0,
            is_stackable: isStackable, is_active: isActive,
            start_at: startAt || null, end_at: endAt || null,
            percent_off: actionType === "PERCENT_OFF" && discountValue ? parseFloat(discountValue) : null,
            min_qty: minQty ? parseInt(minQty) : null, scope_targets,
            rules: [{ rule_order: 0, conditions: Object.keys(conditions).length ? conditions : null, actions }],
        };

        setSaving(true); setError(null);
        try {
            const isEdit = !!editing;
            const body = isEdit ? { code: editing!.code, patch: payload } : { ...payload, code: code.trim() };
            const res = await fetch("/api/admin/promotions", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setShowForm(false); resetForm(); fetchPromotions(search);
        } catch (err: any) { setError(err.message || "Lỗi khi lưu"); }
        finally { setSaving(false); }
    };

    const toggleCategory = (cat: string) => { const n = new Set(selectedCategories); n.has(cat) ? n.delete(cat) : n.add(cat); setSelectedCategories(n); };
    const toggleProduct = (pid: string) => { const n = new Set(selectedProducts); n.has(pid) ? n.delete(pid) : n.add(pid); setSelectedProducts(n); };
    const toggleDay = (d: number) => { const n = new Set(dayOfWeek); n.has(d) ? n.delete(d) : n.add(d); setDayOfWeek(n); };

    /* ============================================================
       RENDER
    ============================================================ */
    return (
        <div>

            {/* ======== SEARCH + CREATE ======== */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <input type="text" placeholder="Tìm theo code hoặc tên..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, flex: 1 }} />
                <button onClick={handleCreate} style={sharedStyles.primaryButton}>+ Tạo mới</button>
            </div>

            {/* ======== PROMOTIONS LIST ======== */}
            {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: colors.text.tertiary }}>Đang tải...</div>
            ) : promotions.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: colors.text.tertiary }}>Chưa có promotion nào</div>
            ) : (
                <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr>
                                {["Code", "Tên", "Loại", "Ưu tiên", "Trạng thái", ""].map(h => (
                                    <th key={h} style={{ ...sharedStyles.tableHeader, fontSize: 12, padding: "8px 10px" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {promotions.map(promo => (
                                <tr key={promo.code} onClick={() => handleEdit(promo)}
                                    style={{ ...sharedStyles.tableRow, cursor: "pointer", background: editing?.code === promo.code ? colors.status.infoLight : "transparent" }}>
                                    <td style={{ padding: "8px 10px", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{promo.code}</td>
                                    <td style={{ padding: "8px 10px" }}>{promo.name}</td>
                                    <td style={{ padding: "8px 10px", color: colors.text.secondary }}>{promo.promo_type}</td>
                                    <td style={{ padding: "8px 10px", textAlign: "center" }}>{promo.priority}</td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <span style={{
                                            display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                                            background: promo.is_active ? colors.status.successLight : colors.bg.tertiary,
                                            color: promo.is_active ? colors.status.success : colors.text.tertiary,
                                        }}>
                                            {promo.is_active ? "Active" : "Off"}
                                        </span>
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <button onClick={e => { e.stopPropagation(); handleEdit(promo); }}
                                            style={{ ...sharedStyles.secondaryButton, padding: "3px 10px", fontSize: 11 }}>Sửa</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ======== DRAWER FORM ======== */}
            <Drawer
                open={showForm}
                onClose={() => { setShowForm(false); resetForm(); }}
                title={editing ? "Sửa Promotion" : "Tạo Promotion mới"}
                subtitle={editing ? `Code: ${editing.code}` : undefined}
            >

                {/* ---- SECTION 1: Thông tin cơ bản ---- */}
                <div style={sectionBox}>
                    <h3 style={sectionTitle}>Thông tin cơ bản</h3>
                    <p style={sectionDesc}>Đặt tên, mã code, và thời gian hiệu lực cho promotion.</p>

                    <Field label="Code" required hint="Mã duy nhất, không thể thay đổi sau khi tạo." width={360}>
                        <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} disabled={!!editing} style={editing ? disabledInput : input} />
                    </Field>

                    <Field label="Tên khuyến mãi" required hint="Tên hiển thị cho nhân viên và khách hàng.">
                        <input type="text" value={name} onChange={e => setName(e.target.value)} style={input} />
                    </Field>

                    <Field label="Thời gian hiệu lực" hint="Để trống nếu không giới hạn thời gian.">
                        <div style={inlineRow}>
                            <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} style={{ ...input, flex: 1 }} />
                            <span style={{ color: colors.text.tertiary, fontSize: 13 }}>đến</span>
                            <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} style={{ ...input, flex: 1 }} />
                        </div>
                    </Field>

                    <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} /> Đang hoạt động
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                            <input type="checkbox" checked={isStackable} onChange={e => setIsStackable(e.target.checked)} style={{ width: 16, height: 16 }} /> Cho phép cộng dồn
                        </label>
                    </div>

                    <Field label="Mức ưu tiên" hint="Promotion có mức ưu tiên cao hơn sẽ được áp dụng trước. Mặc định: 0." width={120}>
                        <input type="number" value={priority} onChange={e => setPriority(e.target.value)} style={{ ...input, textAlign: "center" }} />
                    </Field>
                </div>

                {/* ---- SECTION 2: Phạm vi ---- */}
                <div style={sectionBox}>
                    <h3 style={sectionTitle}>Phạm vi áp dụng</h3>
                    <p style={sectionDesc}>Chọn sản phẩm nào được hưởng khuyến mãi này.</p>

                    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        {(["ALL", "CATEGORY", "PRODUCT"] as const).map(s => (
                            <button key={s} onClick={() => setScopeType(s)} style={chipButton(scopeType === s)}>
                                {s === "ALL" ? "Toàn bộ menu" : s === "CATEGORY" ? "Theo danh mục" : "Theo sản phẩm cụ thể"}
                            </button>
                        ))}
                    </div>

                    {scopeType === "CATEGORY" && (
                        <div style={{ padding: 12, background: colors.bg.secondary, borderRadius: borderRadius.md }}>
                            <p style={{ fontSize: 12, color: colors.text.tertiary, margin: "0 0 8px" }}>Chọn một hoặc nhiều danh mục:</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => toggleCategory(cat)} style={miniChip(selectedCategories.has(cat))}>
                                        {selectedCategories.has(cat) ? "✓ " : ""}{cat}
                                    </button>
                                ))}
                                {categories.length === 0 && <span style={{ fontSize: 13, color: colors.text.tertiary }}>Không tìm thấy danh mục nào</span>}
                            </div>
                        </div>
                    )}

                    {scopeType === "PRODUCT" && (
                        <div style={{ padding: 12, background: colors.bg.secondary, borderRadius: borderRadius.md }}>
                            <p style={{ fontSize: 12, color: colors.text.tertiary, margin: "0 0 8px" }}>Chọn sản phẩm (bấm để chọn/bỏ):</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                                {products.map(p => (
                                    <div key={p.id} onClick={() => toggleProduct(p.id)}
                                        style={{ padding: 6, background: selectedProducts.has(p.id) ? colors.status.infoLight : colors.bg.primary, border: `1px solid ${selectedProducts.has(p.id) ? colors.interactive.primary : colors.border.light}`, borderRadius: 4, cursor: "pointer", fontSize: 12, textAlign: "center" }}>
                                        {p.name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ---- SECTION 3: Điều kiện ---- */}
                <div style={sectionBox}>
                    <h3 style={sectionTitle}>Điều kiện áp dụng</h3>
                    <p style={sectionDesc}>Đơn hàng phải thỏa mãn các điều kiện dưới đây để được áp dụng KM. Bỏ trống = không giới hạn.</p>

                    <Field label="Giá trị đơn hàng tối thiểu" hint="Tổng tiền đơn hàng phải đạt mức này (VNĐ)." width={240}>
                        <input type="number" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} style={input} />
                    </Field>

                    <Field label="Số lượng tổng tối thiểu" hint="Tổng số sản phẩm trong đơn." width={240}>
                        <input type="number" value={minQty} onChange={e => setMinQty(e.target.value)} style={input} />
                    </Field>

                    <Field label="Số lượng sản phẩm đủ điều kiện tối thiểu" hint="Số lượng sản phẩm nằm trong phạm vi áp dụng (hữu ích khi scope là theo danh mục)." width={240}>
                        <input type="number" value={minEligibleQty} onChange={e => setMinEligibleQty(e.target.value)} style={input} />
                    </Field>

                    {/* Progressive disclosure: advanced time conditions */}
                    <div style={{ borderTop: `1px solid ${colors.border.light}`, marginTop: 8, paddingTop: 12 }}>
                        <button onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: colors.interactive.primary, fontWeight: 500, padding: 0 }}>
                            {showAdvanced ? "Ẩn điều kiện nâng cao" : "Hiện điều kiện nâng cao (thời gian, ngày)..."}
                        </button>

                        {showAdvanced && (
                            <div style={{ marginTop: 16 }}>
                                <Field label="Khung giờ áp dụng" hint="Chỉ áp dụng trong khoảng giờ này mỗi ngày. VD: 14:00 đến 17:00 cho Happy Hour.">
                                    <div style={inlineRow}>
                                        <input type="time" value={timeRangeStart} onChange={e => setTimeRangeStart(e.target.value)} style={{ ...input, flex: 1 }} />
                                        <span style={{ color: colors.text.tertiary, fontSize: 13 }}>đến</span>
                                        <input type="time" value={timeRangeEnd} onChange={e => setTimeRangeEnd(e.target.value)} style={{ ...input, flex: 1 }} />
                                    </div>
                                </Field>

                                <Field label="Ngày trong tuần" hint="Chỉ áp dụng vào các ngày được chọn. Bỏ trống = áp dụng mọi ngày.">
                                    <div style={{ display: "flex", gap: 6 }}>
                                        {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((label, idx) => (
                                            <button key={idx} onClick={() => toggleDay(idx)} style={miniChip(dayOfWeek.has(idx))}>{label}</button>
                                        ))}
                                    </div>
                                </Field>

                                <Field label="Khoảng ngày áp dụng" hint="Giới hạn promotion trong một khoảng ngày cụ thể (VD: campaign Tết).">
                                    <div style={inlineRow}>
                                        <input type="date" value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} style={{ ...input, flex: 1 }} />
                                        <span style={{ color: colors.text.tertiary, fontSize: 13 }}>đến</span>
                                        <input type="date" value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} style={{ ...input, flex: 1 }} />
                                    </div>
                                </Field>
                            </div>
                        )}
                    </div>
                </div>

                {/* ---- SECTION 4: Loại khuyến mãi ---- */}
                <div style={sectionBox}>
                    <h3 style={sectionTitle}>Loại khuyến mãi</h3>
                    <p style={sectionDesc}>Chọn cách tính giảm giá cho promotion này.</p>

                    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                        {([
                            ["PERCENT_OFF", "Giảm %"],
                            ["AMOUNT_OFF", "Giảm số tiền cố định"],
                            ["AMOUNT_OFF_PER_ITEM", "Giảm theo từng sản phẩm"],
                            ["BUY_X_GET_Y", "Mua X tặng Y"],
                            ["NTH_ITEM_DISCOUNT", "Ly thứ N giảm giá"],
                            ["TIERED_PERCENT", "Giảm theo bậc thang"],
                        ] as [ActionTypeKey, string][]).map(([key, label]) => (
                            <button key={key} onClick={() => setActionType(key)} style={chipButton(actionType === key)}>{label}</button>
                        ))}
                    </div>

                    {/* Simple discount */}
                    {(actionType === "PERCENT_OFF" || actionType === "AMOUNT_OFF" || actionType === "AMOUNT_OFF_PER_ITEM") && (
                        <Field label={actionType === "PERCENT_OFF" ? "Phần trăm giảm (%)" : "Số tiền giảm (VNĐ)"}
                            hint={actionType === "PERCENT_OFF" ? "Nhập từ 1 đến 100. VD: 15 = giảm 15%." : "Nhập số tiền. VD: 10000 = giảm 10,000đ."}
                            width={240}>
                            <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={input} />
                        </Field>
                    )}

                    {/* BUY_X_GET_Y */}
                    {actionType === "BUY_X_GET_Y" && (
                        <>
                            <Field label="Số lượng phải mua" hint="Khách phải mua đủ số lượng này." width={240}>
                                <input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)} style={input} />
                            </Field>
                            <Field label="Số lượng được tặng" hint="Số sản phẩm được giảm giá." width={240}>
                                <input type="number" value={getQty} onChange={e => setGetQty(e.target.value)} style={input} />
                            </Field>
                            <Field label="Mức giảm cho phần tặng (%)" hint="100 = miễn phí hoàn toàn, 50 = giảm nửa giá." width={240}>
                                <input type="number" value={getDiscountPercent} onChange={e => setGetDiscountPercent(e.target.value)} style={input} />
                            </Field>
                        </>
                    )}

                    {/* NTH_ITEM_DISCOUNT */}
                    {actionType === "NTH_ITEM_DISCOUNT" && (
                        <>
                            <Field label="Ly thứ mấy được giảm" hint="VD: 2 = mỗi ly thứ 2 sẽ được giảm giá." width={240}>
                                <input type="number" value={nthItem} onChange={e => setNthItem(e.target.value)} style={input} />
                            </Field>
                            <Field label="Giảm bao nhiêu phần trăm (%)" hint="VD: 50 = giảm 50%." width={240}>
                                <input type="number" value={nthPercent} onChange={e => setNthPercent(e.target.value)} style={input} />
                            </Field>
                        </>
                    )}

                    {/* TIERED_PERCENT */}
                    {actionType === "TIERED_PERCENT" && (
                        <div>
                            <p style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 12 }}>Mỗi bậc định nghĩa một mức chi tiêu tối thiểu và phần trăm giảm tương ứng. Bậc cao nhất thỏa mãn sẽ được áp dụng.</p>
                            {tiers.map((tier, idx) => (
                                <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                                    <span style={{ fontSize: 13, color: colors.text.secondary, minWidth: 40 }}>Bậc {idx + 1}</span>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 11, color: colors.text.tertiary }}>Từ (VNĐ)</label>
                                        <input type="number" value={tier.min_value} onChange={e => { const n = [...tiers]; n[idx] = { ...n[idx], min_value: e.target.value }; setTiers(n); }} style={input} />
                                    </div>
                                    <div style={{ width: 100 }}>
                                        <label style={{ fontSize: 11, color: colors.text.tertiary }}>Giảm %</label>
                                        <input type="number" value={tier.percent} onChange={e => { const n = [...tiers]; n[idx] = { ...n[idx], percent: e.target.value }; setTiers(n); }} style={input} />
                                    </div>
                                    {tiers.length > 1 && (
                                        <button onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
                                            style={{ background: "transparent", border: "none", color: colors.text.tertiary, cursor: "pointer", fontSize: 16, marginTop: 14 }}>×</button>
                                    )}
                                </div>
                            ))}
                            <button onClick={() => setTiers([...tiers, { min_value: "", percent: "" }])}
                                style={{ ...sharedStyles.secondaryButton, padding: "5px 14px", fontSize: 12, marginTop: 4 }}>
                                + Thêm bậc
                            </button>
                        </div>
                    )}
                </div>

                {/* ======== SUBMIT BAR ======== */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: `1px solid ${colors.border.light}`, marginTop: 8 }}>
                    <button onClick={() => { setShowForm(false); resetForm(); }} style={sharedStyles.secondaryButton}>Hủy bỏ</button>
                    <button onClick={handleSubmit} disabled={saving}
                        style={{ ...sharedStyles.primaryButton, padding: `${spacing["10"]} ${spacing["24"]}`, opacity: saving ? 0.6 : 1 }}>
                        {saving ? "Đang lưu..." : editing ? "Cập nhật Promotion" : "Tạo Promotion"}
                    </button>
                </div>
            </Drawer>
        </div>
    );
}
