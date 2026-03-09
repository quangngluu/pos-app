"use client";

import { useState, useEffect } from "react";
import { colors, spacing } from "@/app/lib/designTokens";
import { Category, sharedStyles } from "./shared";
import { Drawer } from "@/app/components/Drawer";

function CategoryForm({ category, onSave }: { category: Category | null; onSave: (payload: any) => void }) {
    const [code, setCode] = useState(category?.code || "");
    const [name, setName] = useState(category?.name || "");
    const [sortOrder, setSortOrder] = useState(category?.sort_order?.toString() || "0");
    const [isActive, setIsActive] = useState(category?.is_active ?? true);

    const handleSubmit = () => {
        if (!code.trim()) { alert("Code is required"); return; }
        if (!name.trim()) { alert("Name is required"); return; }
        onSave({ code: code.trim().toUpperCase(), name: name.trim(), sort_order: parseInt(sortOrder) || 0, is_active: isActive });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
                <label style={sharedStyles.label}>Code *</label>
                <input type="text" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!category} placeholder="DRINK, CAKE, TOPPING..." style={{ ...(category ? sharedStyles.disabledInput : sharedStyles.input), textTransform: "uppercase" }} />
                {category && <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>Code cannot be changed after creation</div>}
            </div>

            <div>
                <label style={sharedStyles.label}>Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Đồ uống, Bánh..." style={sharedStyles.input} />
            </div>

            <div>
                <label style={sharedStyles.label}>Sort Order</label>
                <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} min="0" style={{ ...sharedStyles.input, maxWidth: 160 }} />
            </div>

            <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 14 }}>Active</span>
                </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid ${colors.border.light}`, paddingTop: 16 }}>
                <button onClick={handleSubmit} style={{ ...sharedStyles.primaryButton, padding: `${spacing['10']} ${spacing['24']}` }}>
                    {category ? "Update Category" : "Create Category"}
                </button>
            </div>
        </div>
    );
}

export function CategoriesTab({ setError }: { setError: (msg: string | null) => void }) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showDrawer, setShowDrawer] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);

    const fetchCategories = async (q = "") => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/admin/categories?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setCategories(data.categories);
        } catch (err: any) { setError(err.message || "Failed to fetch categories"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchCategories(search); }, [search]);

    const handleSave = async (payload: any) => {
        setError(null);
        try {
            const isEdit = !!editingCategory;
            const body = isEdit ? { code: editingCategory!.code, patch: payload } : payload;
            const res = await fetch("/api/admin/categories", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setShowDrawer(false); fetchCategories(search);
        } catch (err: any) { setError(err.message || "Failed to save category"); }
    };

    return (
        <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <input type="text" placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sharedStyles.input, flex: 1 }} />
                <button onClick={() => { setEditingCategory(null); setShowDrawer(true); }} style={sharedStyles.primaryButton}>+ Create Category</button>
            </div>

            {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>Loading...</div>
            ) : categories.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>No categories found</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                            <th style={sharedStyles.tableHeader}>Code</th><th style={sharedStyles.tableHeader}>Name</th>
                            <th style={sharedStyles.tableHeader}>Sort Order</th><th style={sharedStyles.tableHeader}>Active</th><th style={sharedStyles.tableHeader}>Actions</th>
                        </tr></thead>
                        <tbody>
                            {categories.map((cat) => (
                                <tr key={cat.code} style={sharedStyles.tableRow}>
                                    <td style={{ padding: 12, fontFamily: "monospace" }}>{cat.code}</td>
                                    <td style={{ padding: 12 }}>{cat.name}</td>
                                    <td style={{ padding: 12, color: colors.text.secondary }}>{cat.sort_order}</td>
                                    <td style={{ padding: 12 }}><span style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, background: cat.is_active ? colors.status.successLight : colors.bg.secondary, color: cat.is_active ? colors.status.success : colors.text.secondary }}>{cat.is_active ? "Active" : "Inactive"}</span></td>
                                    <td style={{ padding: 12 }}><button onClick={() => { setEditingCategory(cat); setShowDrawer(true); }} style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}` }}>Edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Drawer
                open={showDrawer}
                onClose={() => setShowDrawer(false)}
                title={editingCategory ? "Edit Category" : "Create Category"}
                width={420}
            >
                <CategoryForm
                    key={editingCategory?.code || "new"}
                    category={editingCategory}
                    onSave={handleSave}
                />
            </Drawer>
        </div>
    );
}
