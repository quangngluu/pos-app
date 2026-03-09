"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/app/components";
import { AppShell } from "@/app/components/AppShell";
import { colors, spacing, typography, borderRadius } from "@/app/lib/designTokens";
import type { Tab } from "./components/shared";
import { StoresTab } from "./components/StoresTab";
import { PromotionsTab } from "./components/PromotionsTab";
import { ProductsTab } from "./components/ProductsTab";
import { CategoriesTab } from "./components/CategoriesTab";
import { SubcategoriesTab } from "./components/SubcategoriesTab";

const TAB_TITLES: Record<Tab, string> = {
  stores: "Stores",
  promotions: "Promotions",
  products: "Products",
  categories: "Categories",
  subcategories: "Subcategories",
};

function AdminContent() {
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "stores";
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ padding: spacing["24"], maxWidth: 1200 }}>
      <h1 style={{ fontSize: typography.fontSize["2xl"], fontWeight: typography.fontWeight.bold, marginBottom: spacing["20"], color: colors.text.primary }}>
        {TAB_TITLES[tab] || "Admin"}
      </h1>

      {error && (
        <div style={{
          padding: spacing["12"],
          marginBottom: spacing["16"],
          background: colors.status.errorLight,
          border: `1px solid ${colors.status.error}`,
          borderRadius: borderRadius.base,
          color: colors.status.error,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          {error}
          <Button onClick={() => setError(null)} variant="danger" size="sm">Dismiss</Button>
        </div>
      )}

      {tab === "stores" && <StoresTab setError={setError} />}
      {tab === "promotions" && <PromotionsTab setError={setError} />}
      {tab === "products" && <ProductsTab setError={setError} />}
      {tab === "categories" && <CategoriesTab setError={setError} />}
      {tab === "subcategories" && <SubcategoriesTab setError={setError} />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
        <AdminContent />
      </Suspense>
    </AppShell>
  );
}