"use client";

import { useState } from "react";
import type { ParsedOrder } from "@/app/api/ai/parse-order/route";

type SmartOrderModalProps = {
    onClose: () => void;
    onApply: (parsed: ParsedOrder) => void;
};

export function SmartOrderModal({ onClose, onApply }: SmartOrderModalProps) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ParsedOrder | null>(null);

    const handleParse = async () => {
        if (!text.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch("/api/ai/parse-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: text.trim() }),
            });

            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Parse failed");

            setResult(data.parsed);
        } catch (err: any) {
            setError(err.message || "Failed to parse order");
        } finally {
            setLoading(false);
        }
    };

    const sizeLabel = (size: string) => {
        switch (size) {
            case "SIZE_PHE": return "Phê";
            case "SIZE_LA": return "La";
            case "STD": return "STD";
            default: return size;
        }
    };

    const sugarLabel = (code: string) => {
        switch (code) {
            case "0": return "0%";
            case "30": return "30%";
            case "50": return "50%";
            case "70": return "70%";
            case "100": return "100%";
            case "": return "Mặc định";
            default: return code;
        }
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2000,
                padding: 16,
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: "var(--color-bg-primary)",
                    borderRadius: 16,
                    border: "1px solid var(--color-border-light)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                    width: "100%",
                    maxWidth: 600,
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "20px 24px",
                        borderBottom: "1px solid var(--color-border-light)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>🤖 AI Smart Order</h2>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                            Paste tin nhắn khách → tự động tạo đơn
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: 24,
                            cursor: "pointer",
                            color: "var(--color-text-secondary)",
                            padding: 4,
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
                    {/* Text input */}
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={`Paste tin nhắn khách vào đây...\n\nVí dụ: "Cho mình 2 cf sữa đá ít đường, 1 bạc xỉu size L. Giao 123 Lê Lợi Q1. SĐT 0909123456"`}
                        disabled={loading}
                        style={{
                            width: "100%",
                            minHeight: 120,
                            padding: 14,
                            background: "var(--color-bg-secondary)",
                            border: "1px solid var(--color-border-light)",
                            borderRadius: 10,
                            color: "var(--color-text-primary)",
                            fontSize: 14,
                            lineHeight: 1.5,
                            resize: "vertical",
                            fontFamily: "inherit",
                        }}
                    />

                    {/* Parse button */}
                    <button
                        onClick={handleParse}
                        disabled={loading || !text.trim()}
                        style={{
                            marginTop: 12,
                            width: "100%",
                            padding: "12px 20px",
                            background: loading ? "var(--color-bg-tertiary)" : "var(--color-interactive-primary)",
                            color: loading ? "var(--color-text-secondary)" : "var(--color-text-inverse)",
                            border: "none",
                            borderRadius: 10,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: loading || !text.trim() ? "not-allowed" : "pointer",
                            transition: "all 0.2s ease",
                            opacity: !text.trim() ? 0.5 : 1,
                        }}
                    >
                        {loading ? "⏳ Đang phân tích..." : "🔍 Phân tích đơn hàng"}
                    </button>

                    {/* Error */}
                    {error && (
                        <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                background: "rgba(239,68,68,0.1)",
                                border: "1px solid rgba(239,68,68,0.3)",
                                borderRadius: 8,
                                color: "#ef4444",
                                fontSize: 14,
                            }}
                        >
                            ❌ {error}
                        </div>
                    )}

                    {/* Result Preview */}
                    {result && (
                        <div style={{ marginTop: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--color-text-primary)" }}>
                                📋 Kết quả phân tích ({result.lines.length} món)
                            </h3>

                            {/* Order lines */}
                            <div
                                style={{
                                    background: "var(--color-bg-secondary)",
                                    borderRadius: 10,
                                    border: "1px solid var(--color-border-light)",
                                    overflow: "hidden",
                                }}
                            >
                                {result.lines.map((line, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            padding: "12px 16px",
                                            borderBottom: idx < result.lines.length - 1 ? "1px solid var(--color-border-light)" : undefined,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                        }}
                                    >
                                        <span
                                            style={{
                                                background: "var(--color-interactive-primary)",
                                                color: "var(--color-text-inverse)",
                                                borderRadius: 6,
                                                padding: "2px 8px",
                                                fontSize: 13,
                                                fontWeight: 600,
                                                minWidth: 28,
                                                textAlign: "center",
                                            }}
                                        >
                                            {line.qty}x
                                        </span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: 14 }}>{line.product_name}</div>
                                            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                                                Size: {sizeLabel(line.size)}
                                                {line.sugar_value_code && ` · Đường: ${sugarLabel(line.sugar_value_code)}`}
                                                {line.note && ` · ${line.note}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Customer info */}
                            {result.customer && (result.customer.phone || result.customer.address) && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        padding: 14,
                                        background: "var(--color-bg-secondary)",
                                        borderRadius: 10,
                                        border: "1px solid var(--color-border-light)",
                                        fontSize: 13,
                                    }}
                                >
                                    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>👤 Thông tin khách</div>
                                    {result.customer.phone && <div>📱 {result.customer.phone}</div>}
                                    {result.customer.address && <div style={{ marginTop: 4 }}>📍 {result.customer.address}</div>}
                                    {result.customer.note && <div style={{ marginTop: 4 }}>📝 {result.customer.note}</div>}
                                </div>
                            )}

                            {/* Raw note */}
                            {result.raw_note && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        padding: 10,
                                        background: "rgba(234,179,8,0.08)",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        color: "var(--color-text-secondary)",
                                    }}
                                >
                                    ⚠️ Không parse được: {result.raw_note}
                                </div>
                            )}

                            {/* Apply button */}
                            <button
                                onClick={() => onApply(result)}
                                style={{
                                    marginTop: 16,
                                    width: "100%",
                                    padding: "14px 20px",
                                    background: "#10b981",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 10,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                ✅ Áp dụng vào đơn hàng
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
