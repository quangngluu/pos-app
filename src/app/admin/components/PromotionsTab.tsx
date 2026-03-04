"use client";

import { useState, useEffect } from "react";
import { colors, spacing } from "@/app/lib/designTokens";
import { Promotion, sharedStyles } from "./shared";
import { PromotionModal } from "./PromotionModal";

export function PromotionsTab({ setError }: { setError: (msg: string | null) => void }) {
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
                    style={{ ...sharedStyles.input, flex: 1 }}
                />
                <button
                    onClick={handleCreate}
                    style={sharedStyles.primaryButton}
                >
                    + Create Promotion
                </button>
            </div>

            {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>Loading...</div>
            ) : promotions.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: colors.text.secondary }}>No promotions found</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                                <th style={sharedStyles.tableHeader}>Code</th>
                                <th style={sharedStyles.tableHeader}>Name</th>
                                <th style={sharedStyles.tableHeader}>Type</th>
                                <th style={sharedStyles.tableHeader}>% Off</th>
                                <th style={sharedStyles.tableHeader}>Min Qty</th>
                                <th style={sharedStyles.tableHeader}>Priority</th>
                                <th style={sharedStyles.tableHeader}>Stackable</th>
                                <th style={sharedStyles.tableHeader}>Active</th>
                                <th style={sharedStyles.tableHeader}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {promotions.map((promo) => (
                                <tr key={promo.code} style={sharedStyles.tableRow}>
                                    <td style={{ padding: 12, fontWeight: 500 }}>{promo.code}</td>
                                    <td style={{ padding: 12 }}>{promo.name}</td>
                                    <td style={{ padding: 12, color: colors.text.secondary, fontSize: 14 }}>{promo.promo_type}</td>
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
                                                background: promo.is_active ? colors.status.successLight : colors.bg.secondary,
                                                color: promo.is_active ? colors.status.success : colors.text.secondary,
                                            }}
                                        >
                                            {promo.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        <button
                                            onClick={() => handleEdit(promo)}
                                            style={{ ...sharedStyles.secondaryButton, padding: `${spacing['8']} ${spacing['12']}` }}
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
