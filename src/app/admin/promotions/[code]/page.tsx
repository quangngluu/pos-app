"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Promotion = {
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
};

type PromotionRule = {
  id: string;
  promotion_code: string;
  rule_order: number;
  conditions: any;
  actions: any[];
};

type ScopeTarget = {
  id: string;
  promotion_code: string;
  target_type: 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCT' | 'VARIANT';
  target_id: string;
  is_included: boolean;
};

type Category = {
  code: string;
  name: string;
};

export default function PromotionEditPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const isNew = code === "new";

  const [activeTab, setActiveTab] = useState<"general" | "rules" | "scopes">("general");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // General tab
  const [promotion, setPromotion] = useState<Partial<Promotion>>({
    code: "",
    name: "",
    promo_type: "DISCOUNT",
    priority: 0,
    is_stackable: false,
    is_active: true,
    start_at: null,
    end_at: null,
    percent_off: null,
    min_qty: null,
  });

  // Rules tab
  const [rules, setRules] = useState<PromotionRule[]>([]);
  const [rulesJson, setRulesJson] = useState("[]");
  const [jsonError, setJsonError] = useState("");

  // Scopes tab
  const [scopes, setScopes] = useState<ScopeTarget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!isNew) {
      loadPromotion();
      loadRules();
      loadScopes();
    }
    loadCategories();
  }, [code]);

  async function loadPromotion() {
    try {
      const res = await fetch(`/api/admin/promotions?q=${code}`);
      const json = await res.json();
      if (json.ok && json.promotions?.length > 0) {
        setPromotion(json.promotions[0]);
      }
    } catch (e) {
      console.error("Failed to load promotion:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadRules() {
    try {
      const res = await fetch(`/api/admin/promotions/rules?promotion_code=${code}`);
      const json = await res.json();
      if (json.ok) {
        setRules(json.rules || []);
        setRulesJson(JSON.stringify(json.rules || [], null, 2));
      }
    } catch (e) {
      console.error("Failed to load rules:", e);
    }
  }

  async function loadScopes() {
    try {
      const res = await fetch(`/api/admin/promotions/scopes?promotion_code=${code}`);
      const json = await res.json();
      if (json.ok) {
        setScopes(json.scopes || []);
        const cats = json.scopes
          ?.filter((s: ScopeTarget) => s.target_type === "CATEGORY" && s.is_included)
          .map((s: ScopeTarget) => s.target_id) || [];
        setSelectedCategories(cats);
      }
    } catch (e) {
      console.error("Failed to load scopes:", e);
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch("/api/admin/categories");
      const json = await res.json();
      if (json.ok) {
        setCategories(json.categories || []);
      }
    } catch (e) {
      console.error("Failed to load categories:", e);
    }
  }

  async function saveGeneral() {
    setSaving(true);
    try {
      const endpoint = isNew 
        ? "/api/admin/promotions"
        : "/api/admin/promotions";
      
      const body = isNew 
        ? promotion 
        : { code: promotion.code, patch: promotion };

      const res = await fetch(endpoint, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.ok) {
        alert("Promotion saved successfully!");
        if (isNew) {
          router.push(`/admin/promotions/${promotion.code}`);
        }
      } else {
        alert("Failed to save: " + json.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRules() {
    setSaving(true);
    try {
      // Validate JSON
      const parsed = JSON.parse(rulesJson);
      setJsonError("");

      // Delete existing rules and create new ones
      // For now, just create new rules (TODO: proper update logic)
      for (const rule of parsed) {
        const res = await fetch("/api/admin/promotions/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promotion_code: code,
            ...rule,
          }),
        });

        const json = await res.json();
        if (!json.ok) {
          throw new Error(json.error);
        }
      }

      alert("Rules saved successfully!");
      loadRules();
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        setJsonError("Invalid JSON: " + e.message);
      } else {
        alert("Error: " + e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveScopes() {
    setSaving(true);
    try {
      // Create category scopes
      const targets = selectedCategories.map(cat => ({
        target_type: "CATEGORY" as const,
        target_id: cat,
        is_included: true,
      }));

      if (targets.length > 0) {
        const res = await fetch("/api/admin/promotions/scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promotion_code: code,
            targets,
          }),
        });

        const json = await res.json();
        if (json.ok) {
          alert("Scopes saved successfully!");
          loadScopes();
        } else {
          alert("Failed to save scopes: " + json.error);
        }
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-600">Loading promotion...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            <Link 
              href="/admin/promotions"
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isNew ? "New Promotion" : `Edit: ${promotion.code}`}
          </h1>
          <p className="text-gray-600 mt-1">
            {isNew ? "Create a new promotional campaign" : "Update promotion settings"}
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("general")}
                className={`px-6 py-3 border-b-2 font-medium text-sm ${
                  activeTab === "general"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                General
              </button>
              <button
                onClick={() => setActiveTab("rules")}
                className={`px-6 py-3 border-b-2 font-medium text-sm ${
                  activeTab === "rules"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                disabled={isNew}
              >
                Rules & Actions
              </button>
              <button
                onClick={() => setActiveTab("scopes")}
                className={`px-6 py-3 border-b-2 font-medium text-sm ${
                  activeTab === "scopes"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                disabled={isNew}
              >
                Scopes & Targeting
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === "general" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code *
                    </label>
                    <input
                      type="text"
                      value={promotion.code || ""}
                      onChange={(e) => setPromotion({ ...promotion, code: e.target.value.toUpperCase() })}
                      disabled={!isNew}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="PROMO_CODE"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={promotion.name || ""}
                      onChange={(e) => setPromotion({ ...promotion, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Promotion Name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type *
                    </label>
                    <select
                      value={promotion.promo_type || "DISCOUNT"}
                      onChange={(e) => setPromotion({ ...promotion, promo_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="DISCOUNT">DISCOUNT</option>
                      <option value="RULE">RULE</option>
                      <option value="GIFT">GIFT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={promotion.priority || 0}
                      onChange={(e) => setPromotion({ ...promotion, priority: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="datetime-local"
                      value={promotion.start_at ? new Date(promotion.start_at).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setPromotion({ ...promotion, start_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date
                    </label>
                    <input
                      type="datetime-local"
                      value={promotion.end_at ? new Date(promotion.end_at).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setPromotion({ ...promotion, end_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={promotion.is_active || false}
                      onChange={(e) => setPromotion({ ...promotion, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={promotion.is_stackable || false}
                      onChange={(e) => setPromotion({ ...promotion, is_stackable: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Stackable</span>
                  </label>
                </div>

                <div className="border-t pt-6">
                  <button
                    onClick={saveGeneral}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
                  >
                    {saving ? "Saving..." : "Save General Settings"}
                  </button>
                </div>
              </div>
            )}

            {/* Rules Tab */}
            {activeTab === "rules" && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Rules JSON
                    </label>
                    <a
                      href="https://github.com"
                      target="_blank"
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View Documentation →
                    </a>
                  </div>
                  
                  <textarea
                    value={rulesJson}
                    onChange={(e) => {
                      setRulesJson(e.target.value);
                      setJsonError("");
                    }}
                    className="w-full h-96 px-4 py-3 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder='[{"rule_order": 0, "conditions": {...}, "actions": [...]}]'
                  />
                  
                  {jsonError && (
                    <div className="mt-2 text-sm text-red-600">{jsonError}</div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Example Rule</h3>
                  <pre className="text-xs text-blue-800 overflow-x-auto">
{`[
  {
    "rule_order": 0,
    "conditions": {
      "min_order_value": 100000,
      "min_eligible_qty": 2
    },
    "actions": [
      {
        "type": "PERCENT_OFF",
        "percent": 10,
        "apply_to": "ELIGIBLE_LINES"
      }
    ]
  }
]`}
                  </pre>
                </div>

                <div className="border-t pt-6">
                  <button
                    onClick={saveRules}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
                  >
                    {saving ? "Saving..." : "Save Rules"}
                  </button>
                </div>
              </div>
            )}

            {/* Scopes Tab */}
            {activeTab === "scopes" && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Target Categories
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {categories.map((cat) => (
                      <label key={cat.code} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat.code)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories([...selectedCategories, cat.code]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(c => c !== cat.code));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> If no categories are selected and no product/variant targets are added, 
                    DISCOUNT promotions will not apply to any items (business rule: no scope = no discount).
                  </p>
                </div>

                <div className="border-t pt-6">
                  <button
                    onClick={saveScopes}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
                  >
                    {saving ? "Saving..." : "Save Scopes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
