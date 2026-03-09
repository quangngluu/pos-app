"use client";

import { useState, useEffect } from "react";
import { colors, spacing } from "@/app/lib/designTokens";
import { Category, Subcategory, sharedStyles } from "./shared";
import { Drawer } from "@/app/components/Drawer";

function SubcategoryForm({ subcategory, categories, onSave }: { subcategory: Subcategory | null; categories: Category[]; onSave: (payload: any) => void }) {
    const [categoryCode, setCategoryCode] = useState(subcategory?.category_code || "");
    const [name, setName] = useState(subcategory?.name || "");
    const [sortOrder, setSortOrder] = useState(subcategory?.sort_order?.toString() || "0");
    const [isActive, setIsActive] = useState(subcategory?.is_active ?? true);

    const handleSubmit = () => {
        if (!categoryCode) { alert("Category is required"); return; }
        if (!name.trim()) { alert("Name is required"); return; }
        onSave({ category_code: categoryCode, name: name.trim(), sort_order: parseInt(sortOrder) || 0, is_active: isActive });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
                <label style={sharedStyles.label}>Category *</label>
                <select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} style={sharedStyles.input} disabled={!!subcategory}>
                    <option value="">Select category...</option>
                    {categories.map((cat) => <option key={cat.code} value={cat.code}>{cat.name} ({cat.code})</option>)}
                </select>
            </div>

            <div>
                <label style={sharedStyles.label}>Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Subcategory name" style={sharedStyles.input} />
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
                    {subcategory ? "Update Subcategory" : "Create Subcategory"}
                </button>
            </div>
        </div>
    );
}

export function SubcategoriesTab({ setError }: { setError: (msg: string | null) => void }) {
    const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [showDrawer, setShowDrawer] = useState(false);
    const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null);

    const fetchCategories = async () => {
        try { const res = await fetch("/api/admin/categories"); const data = await res.json(); if (data.ok) setCategories(data.categories || []); }
        catch (err) { console.error("Failed to fetch categories:", err); }
    };

    const fetchSubcategories = async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams();
            if (search) params.set("q", search);
            if (filterCategory) params.set("category_code", filterCategory);
            const res = await fetch(`/api/admin/subcategories?${params.toString()}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setSubcategories(data.subcategories || []);
        } catch (err: any) { setError(err.message || "Failed to fetch subcategories"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchCategories(); }, []);
    useEffect(() => { fetchSubcategories(); }, [search, filterCategory]);

    const handleSave = async (payload: any) => {
        setError(null);
        try {
            const isEdit = !!editingSubcategory;
            const body = isEdit ? { id: editingSubcategory!.id, patch: payload } : payload;
            const res = await fetch("/api/admin/subcategories", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            setShowDrawer(false); fetchSubcategories();
        } catch (err: any) { setError(err.message || "Failed to save subcategory"); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this subcategory?")) return;
        setError(null);
        try {
            const res = await fetch(`/api/admin/subcategories?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            fetchSubcategories();
        } catch (err: any) { setError(err.message || "Failed to delete subcategory"); }
    };

    return (
        <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <input type="text" placeholder="Search subcategories..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sharedStyles.input, flex: 1, minWidth: 200 }} />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ ...sharedStyles.input, width: 200 }}>
                    <option value="">All Categories</option>
                    {categories.map((cat) => <option key={cat.code} value={cat.code}>{cat.name}</option>)}
                </select>
                <button onClick={() => { setEditingSubcategory(null); setShowDrawer(true); }} style={sharedStyles.primaryButton}>+ Create Subcategory</button>
            </div>

            {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>Loading...</div>
            ) : subcategories.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>No subcategories found</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                            <th style={sharedStyles.tableHeader}>Category</th><th style={sharedStyles.tableHeader}>Name</th>
                            <th style={sharedStyles.tableHeader}>Sort Order</th><th style={sharedStyles.tableHeader}>Active</th><th style={sharedStyles.tableHeader}>Actions</th>
                        </tr></thead>
                        <tbody>
                            {subcategories.map((sub) => (
                                <tr key={sub.id} style={sharedStyles.tableRow}>
                                    <td style={{ padding: 12, fontFamily: "monospace" }}>{sub.categories?.name || sub.category_code}</td>
                                    <td style={{ padding: 12 }}>{sub.name}</td>
                                    <td style={{ padding: 12, color: colors.text.secondary }}>{sub.sort_order}</td>
                                    <td style={{ padding: 12 }}><span style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, background: sub.is_active ? colors.status.successLight : colors.bg.secondary, color: sub.is_active ? colors.status.success : colors.text.secondary }}>{sub.is_active ? "Active" : "Inactive"}</span></td>
                                    <td style={{ padding: 12, display: "flex", gap: 8 }}>
                                        <button onClick={() => { setEditingSubcategory(sub); setShowDrawer(true); }} style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}` }}>Edit</button>
                                        <button onClick={() => handleDelete(sub.id)} style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}`, color: colors.status.error, borderColor: colors.status.error }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Drawer
                open={showDrawer}
                onClose={() => setShowDrawer(false)}
                title={editingSubcategory ? "Edit Subcategory" : "Create Subcategory"}
                width={420}
            >
                <SubcategoryForm
                    key={editingSubcategory?.id || "new"}
                    subcategory={editingSubcategory}
                    categories={categories}
                    onSave={handleSave}
                />
            </Drawer>
        </div>
    );
}
