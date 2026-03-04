"use client";

import { useState } from "react";
import { Button } from "@/app/components";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";
import type { Tab } from "./components/shared";
import { StoresTab } from "./components/StoresTab";
import { PromotionsTab } from "./components/PromotionsTab";
import { ProductsTab } from "./components/ProductsTab";
import { CategoriesTab } from "./components/CategoriesTab";
import { SubcategoriesTab } from "./components/SubcategoriesTab";

const TABS: { key: Tab; label: string }[] = [
  { key: "stores", label: "Stores" },
  { key: "promotions", label: "Promotions" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "subcategories", label: "Subcategories" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("stores");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ padding: spacing['24'], maxWidth: 1400, margin: "0 auto", background: colors.bg.primary }}>
      <h1 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.semibold, marginBottom: spacing['24'], color: colors.text.primary }}>Admin Panel</h1>

      {error && (
        <div
          style={{
            padding: spacing['12'],
            marginBottom: spacing['16'],
            background: colors.status.errorLight,
            border: `1px solid ${colors.status.error}`,
            borderRadius: borderRadius.base,
            color: colors.status.error,
          }}
        >
          {error}
          <Button
            onClick={() => setError(null)}
            variant="danger"
            size="sm"
            style={{ marginLeft: spacing['12'] }}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: spacing['8'], marginBottom: spacing['24'], borderBottom: `1px solid ${colors.border.light}` }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: `${spacing['12']} ${spacing['24']}`,
              background: activeTab === tab.key ? colors.bg.secondary : "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${colors.interactive.primary}` : "2px solid transparent",
              color: activeTab === tab.key ? colors.text.primary : colors.text.tertiary,
              cursor: "pointer",
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "stores" && <StoresTab setError={setError} />}
      {activeTab === "promotions" && <PromotionsTab setError={setError} />}
      {activeTab === "products" && <ProductsTab setError={setError} />}
      {activeTab === "categories" && <CategoriesTab setError={setError} />}
      {activeTab === "subcategories" && <SubcategoriesTab setError={setError} />}
    </div>
  );
}