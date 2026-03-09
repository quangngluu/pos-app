"use client";

import { useState, useEffect, useCallback } from "react";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";
import { Product, Category, sharedStyles } from "./shared";
import { Drawer } from "@/app/components/Drawer";

interface SugarOption { code: string; name_default: string; meta: any; }

function ProductForm({
    product,
    onSave,
}: {
    product: Product | null;
    onSave: (payload: any) => void;
}) {
    const [code, setCode] = useState(product?.code || "");
    const [name, setName] = useState(product?.name || "");
    const [category, setCategory] = useState(product?.category || "");
    const [isActive, setIsActive] = useState(product?.is_active ?? true);
    const [sugarOptions, setSugarOptions] = useState<SugarOption[]>([]);
    const [selectedSugar, setSelectedSugar] = useState<Set<string>>(new Set());
    const [sugarDefault, setSugarDefault] = useState<string>("SUGAR_100");
    const [priceMode, setPriceMode] = useState<"single" | "multi">("single");
    const [singleSizeKey, setSingleSizeKey] = useState<string>("SIZE_LA");
    const [priceSTD, setPriceSTD] = useState(product?.prices.STD?.toString() || "");
    const [pricePHE, setPricePHE] = useState(product?.prices.SIZE_PHE?.toString() || "");
    const [priceLA, setPriceLA] = useState(product?.prices.SIZE_LA?.toString() || "");
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!product);
    const [codeEditing, setCodeEditing] = useState(false);

    // Sugar presets
    const PRESETS: Record<string, { label: string; codes: string[] }> = {
        tra_sua: { label: "Trà sữa", codes: ["SUGAR_0_MILK30", "SUGAR_30", "SUGAR_50", "SUGAR_70", "SUGAR_100", "SUGAR_120"] },
        tra_trai_cay: { label: "Trà trái cây", codes: ["SUGAR_0", "SUGAR_30", "SUGAR_50", "SUGAR_70", "SUGAR_100", "SUGAR_120"] },
        phe_nau: { label: "Phê Nâu/DL", codes: ["SUGAR_30", "SUGAR_50", "SUGAR_70", "SUGAR_100", "SUGAR_120"] },
        phe_den: { label: "Phê Đen", codes: ["SUGAR_0_MILK0", "SUGAR_50", "SUGAR_100"] },
        all: { label: "Tất cả", codes: [] },  // filled dynamically
    };

    useEffect(() => { fetchCategories(); fetchSugarOptions(); }, []);
    useEffect(() => { if (product) loadProductSugar(product.id); }, [product]);
    useEffect(() => {
        if (product) {
            const hasMulti = !!(product.prices.SIZE_PHE || product.prices.SIZE_LA);
            const hasStd = !!product.prices.STD;
            if (hasMulti && !hasStd) {
                setPriceMode("multi");
            } else if (hasStd && !hasMulti) {
                setPriceMode("single");
                setSingleSizeKey("STD");
                setPriceSTD(product.prices.STD?.toString() || "");
            } else if (hasMulti) {
                setPriceMode("multi");
            } else {
                setPriceMode("single");
                setSingleSizeKey("SIZE_LA");
            }
        }
    }, [product]);
    useEffect(() => {
        if (!product && !codeManuallyEdited && category && name) generateCode(category, name);
    }, [category, name, codeManuallyEdited, product]);

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/admin/categories");
            const data = await res.json();
            if (data.ok) setCategories(data.categories.filter((c: Category) => c.is_active));
        } catch (err) { console.error("Failed to fetch categories:", err); }
        finally { setCategoriesLoading(false); }
    };

    const fetchSugarOptions = async () => {
        try {
            const res = await fetch("/api/admin/sugar-options");
            const data = await res.json();
            if (data.ok) {
                setSugarOptions(data.options);
                PRESETS.all.codes = data.options.map((o: SugarOption) => o.code);
            }
        } catch (err) { console.error("Failed to fetch sugar options:", err); }
    };

    const loadProductSugar = async (productId: string) => {
        try {
            const res = await fetch(`/api/admin/sugar-options?product_id=${productId}`);
            const data = await res.json();
            if (data.ok && data.selected) {
                setSelectedSugar(new Set(data.selected.map((s: any) => s.value_code)));
                const def = data.selected.find((s: any) => s.is_default);
                if (def) setSugarDefault(def.value_code);
            }
        } catch (err) { console.error("Failed to load product sugar:", err); }
    };

    const toggleSugar = (code: string) => {
        setSelectedSugar(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const applyPreset = (codes: string[]) => setSelectedSugar(new Set(codes));

    const generateCode = async (cat: string, productName: string) => {
        try {
            const res = await fetch(`/api/admin/products/generate-code?category=${encodeURIComponent(cat)}&name=${encodeURIComponent(productName)}`);
            const data = await res.json();
            if (data.ok && data.code) setCode(data.code);
        } catch (err) { console.error("Failed to generate code:", err); }
    };

    const handleSubmit = () => {
        if (!code.trim() || !name.trim()) { alert("Code and Name are required"); return; }
        if (!category.trim()) { alert("Category is required"); return; }
        const prices: any = {};
        if (priceMode === "single") {
            const val = priceSTD.trim() || priceLA.trim();
            if (val && !isNaN(parseFloat(val))) {
                prices[singleSizeKey] = parseFloat(val);
            }
        } else {
            if (pricePHE.trim() && !isNaN(parseFloat(pricePHE))) prices.SIZE_PHE = parseFloat(pricePHE);
            if (priceLA.trim() && !isNaN(parseFloat(priceLA))) prices.SIZE_LA = parseFloat(priceLA);
        }
        const patch = { code: code.trim(), name: name.trim(), category: category.trim(), category_code: category.trim(), is_active: isActive, has_sugar_options: selectedSugar.size > 0, sugar_options: Array.from(selectedSugar), sugar_default: sugarDefault };
        onSave(product ? { patch, prices, priceMode } : { ...patch, prices });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ marginBottom: 16 }}>
                <label style={sharedStyles.label}>Category *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={categoriesLoading} style={{ ...sharedStyles.input, color: colors.text.primary, background: colors.bg.secondary }}>
                    <option value="">-- Select Category --</option>
                    {categories.map((cat) => <option key={cat.code} value={cat.code}>{cat.name} ({cat.code})</option>)}
                </select>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={sharedStyles.label}>Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Phở mai cà phê..." style={sharedStyles.input} />
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={sharedStyles.label}>Code *</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} disabled={!codeEditing && !product} placeholder="Auto-generated..." style={{ ...sharedStyles.input, flex: 1, background: !codeEditing && !product ? colors.bg.tertiary : colors.bg.secondary, color: !codeEditing && !product ? colors.text.secondary : colors.text.primary, cursor: !codeEditing && !product ? "not-allowed" : "text", fontFamily: typography.fontFamily.mono }} />
                    {!product && !codeEditing && <button onClick={() => { setCodeEditing(true); setCodeManuallyEdited(true); }} style={{ ...sharedStyles.secondaryButton, padding: `${spacing['10']} ${spacing['12']}` }}>Edit</button>}
                </div>
                {!product && !codeManuallyEdited && <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>Code auto-generated from category + name</div>}
            </div>

            <div style={{ marginBottom: 16, padding: 16, background: colors.bg.secondary, borderRadius: borderRadius.md, border: `1px solid ${colors.border.light}` }}>
                <label style={sharedStyles.labelSemibold}>Pricing Mode</label>
                <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="radio" checked={priceMode === "single"} onChange={() => setPriceMode("single")} style={{ width: 16, height: 16 }} /><span style={{ fontSize: 14 }}>1 size</span></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="radio" checked={priceMode === "multi"} onChange={() => setPriceMode("multi")} style={{ width: 16, height: 16 }} /><span style={{ fontSize: 14 }}>2 sizes (Phê + La)</span></label>
                </div>
            </div>

            {priceMode === "single" ? (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={sharedStyles.label}>Size</label>
                            <select value={singleSizeKey} onChange={(e) => setSingleSizeKey(e.target.value)} style={{ ...sharedStyles.input, background: colors.bg.secondary, color: colors.text.primary }}>
                                <option value="SIZE_LA">La (lớn) — thường dùng</option>
                                <option value="SIZE_PHE">Phê (nhỏ)</option>
                                <option value="STD">STD (không chia size)</option>
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={sharedStyles.label}>Giá</label>
                            <input type="number" value={priceMode === "single" && singleSizeKey !== "STD" ? priceLA || priceSTD : priceSTD} onChange={(e) => { if (singleSizeKey === "STD") setPriceSTD(e.target.value); else setPriceLA(e.target.value); }} min="0" step="1000" placeholder="45000" style={sharedStyles.input} />
                        </div>
                    </div>
                    <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 6 }}>💡 Hầu hết sản phẩm 1 size dùng size La. Chọn STD nếu không chia size (VD: topping, merchandise).</div>
                </div>
            ) : (
                <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={sharedStyles.label}>Giá Phê (nhỏ)</label><input type="number" value={pricePHE} onChange={(e) => setPricePHE(e.target.value)} min="0" step="1000" placeholder="35000" style={sharedStyles.input} /></div>
                    <div><label style={sharedStyles.label}>Giá La (lớn)</label><input type="number" value={priceLA} onChange={(e) => setPriceLA(e.target.value)} min="0" step="1000" placeholder="45000" style={sharedStyles.input} /></div>
                </div>
            )}

            <div style={{ marginBottom: 16, padding: 16, background: colors.bg.secondary, borderRadius: borderRadius.md, border: `1px solid ${colors.border.light}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: selectedSugar.size > 0 || sugarOptions.length > 0 ? 12 : 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Tùy chọn đường ({selectedSugar.size}/{sugarOptions.length})</span>
                    <button type="button" onClick={() => selectedSugar.size > 0 ? setSelectedSugar(new Set()) : applyPreset(sugarOptions.map(o => o.code))} style={{ ...sharedStyles.secondaryButton, padding: "4px 10px", fontSize: 12 }}>{selectedSugar.size > 0 ? "Bỏ hết" : "Chọn tất cả"}</button>
                </div>
                {sugarOptions.length > 0 && (
                    <>
                        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                            {Object.entries(PRESETS).filter(([k]) => k !== "all").map(([key, preset]) => (
                                <button key={key} type="button" onClick={() => applyPreset(preset.codes)} style={{ padding: "3px 10px", fontSize: 11, borderRadius: 12, border: `1px solid ${colors.border.light}`, background: "transparent", color: colors.text.secondary, cursor: "pointer" }}>{preset.label}</button>
                            ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                            {sugarOptions.map(opt => (
                                <label key={opt.code} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, padding: "3px 0" }}>
                                    <input type="checkbox" checked={selectedSugar.has(opt.code)} onChange={() => toggleSugar(opt.code)} style={{ width: 14, height: 14 }} />
                                    <span>{opt.name_default}</span>
                                    {selectedSugar.has(opt.code) && (
                                        <input type="radio" name="sugar_default" checked={sugarDefault === opt.code} onChange={() => setSugarDefault(opt.code)} title="Mặc định" style={{ width: 12, height: 12, marginLeft: "auto" }} />
                                    )}
                                </label>
                            ))}
                        </div>
                        {selectedSugar.size > 0 && (
                            <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 8 }}>🔘 = mức đường mặc định khi order</div>
                        )}
                    </>
                )}
            </div>

            <div style={{ marginBottom: 16 }}><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} /><span style={{ fontSize: 14 }}>Active</span></label></div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid ${colors.border.light}`, paddingTop: 16 }}>
                <button onClick={handleSubmit} style={{ ...sharedStyles.primaryButton, padding: `${spacing['10']} ${spacing['24']}` }}>
                    {product ? "Update Product" : "Create Product"}
                </button>
            </div>
        </div>
    );
}

export function ProductsTab({ setError }: { setError: (msg: string | null) => void }) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showInactive, setShowInactive] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const fetchProducts = async (q = "") => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/admin/products?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setProducts(data.products);
        } catch (err: any) { setError(err.message || "Failed to fetch products"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchProducts(search); }, [search]);

    const handleSave = async (payload: any) => {
        setError(null);
        try {
            const isEdit = !!editingProduct;
            const body = isEdit ? { id: editingProduct!.id, patch: payload.patch, prices: payload.prices } : payload;
            const res = await fetch("/api/admin/products", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setShowModal(false); fetchProducts(search);
        } catch (err: any) { setError(err.message || "Failed to save product"); }
    };

    return (
        <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
                <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sharedStyles.input, flex: 1 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: colors.text.secondary, fontSize: 13, cursor: "pointer", userSelect: "none" }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Show Inactive</label>
                <button onClick={() => { setEditingProduct(null); setShowModal(true); }} style={sharedStyles.primaryButton}>+ Create Product</button>
            </div>

            {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>Loading...</div>
            ) : products.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>No products found</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                            <th style={sharedStyles.tableHeader}>Code</th><th style={sharedStyles.tableHeader}>Name</th><th style={sharedStyles.tableHeader}>Category</th>
                            <th style={{ ...sharedStyles.tableHeader, textAlign: "right" }}>STD</th><th style={{ ...sharedStyles.tableHeader, textAlign: "right" }}>PHE</th><th style={{ ...sharedStyles.tableHeader, textAlign: "right" }}>LA</th>
                            <th style={sharedStyles.tableHeader}>Active</th><th style={sharedStyles.tableHeader}>Actions</th>
                        </tr></thead>
                        <tbody>
                            {products.filter(p => showInactive || p.is_active).map((product) => (
                                <tr key={product.id} style={sharedStyles.tableRow}>
                                    <td style={{ padding: 12, fontFamily: "monospace" }}>{product.code}</td>
                                    <td style={{ padding: 12 }}>{product.name}</td>
                                    <td style={{ padding: 12, color: colors.text.secondary, fontSize: 14 }}>{product.category || "-"}</td>
                                    <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace", color: product.prices.STD ? undefined : colors.text.secondary }}>{product.prices.STD ? `${product.prices.STD.toLocaleString()}đ` : "N/A"}</td>
                                    <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace", color: product.prices.SIZE_PHE ? undefined : colors.text.secondary }}>{product.prices.SIZE_PHE ? `${product.prices.SIZE_PHE.toLocaleString()}đ` : "N/A"}</td>
                                    <td style={{ padding: 12, textAlign: "right", fontFamily: "monospace", color: product.prices.SIZE_LA ? undefined : colors.text.secondary }}>{product.prices.SIZE_LA ? `${product.prices.SIZE_LA.toLocaleString()}đ` : "N/A"}</td>
                                    <td style={{ padding: 12 }}><span style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, background: product.is_active ? colors.status.successLight : colors.bg.secondary, color: product.is_active ? colors.status.success : colors.text.secondary }}>{product.is_active ? "Active" : "Inactive"}</span></td>
                                    <td style={{ padding: 12 }}><button onClick={() => { setEditingProduct(product); setShowModal(true); }} style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}` }}>Edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Drawer
                open={showModal}
                onClose={() => setShowModal(false)}
                title={editingProduct ? "Edit Product" : "Create Product"}
                width={540}
            >
                <ProductForm
                    key={editingProduct?.id || "new"}
                    product={editingProduct}
                    onSave={handleSave}
                />
            </Drawer>
        </div>
    );
}
