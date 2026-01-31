"use client";

import { useState, useEffect } from "react";
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
  scopes?: string[];
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  useEffect(() => {
    loadPromotions();
  }, [searchQuery]);

  async function loadPromotions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      
      const res = await fetch(`/api/admin/promotions?${params}`);
      const json = await res.json();
      
      if (json.ok) {
        setPromotions(json.promotions || []);
      } else {
        alert("Failed to load promotions: " + json.error);
      }
    } catch (e: any) {
      alert("Error loading promotions: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredPromotions = filterActive === null 
    ? promotions 
    : promotions.filter(p => p.is_active === filterActive);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Promotions Management</h1>
            <p className="text-gray-600 mt-1">Manage promotional campaigns and rules</p>
          </div>
          <Link 
            href="/admin/promotions/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + New Promotion
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Code or name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filterActive === null ? "all" : filterActive ? "active" : "inactive"}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterActive(val === "all" ? null : val === "active");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={loadPromotions}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Promotions List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading promotions...</div>
          ) : filteredPromotions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No promotions found. Create your first promotion to get started.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scopes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPromotions.map((promo) => (
                  <tr key={promo.code} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-mono text-sm font-medium text-gray-900">
                        {promo.code}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{promo.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {promo.promo_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {promo.priority}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        promo.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {promo.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        {promo.start_at ? new Date(promo.start_at).toLocaleDateString() : 'No start'}
                      </div>
                      <div>
                        {promo.end_at ? new Date(promo.end_at).toLocaleDateString() : 'No end'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {promo.scopes && promo.scopes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {promo.scopes.slice(0, 2).map(s => (
                            <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              {s}
                            </span>
                          ))}
                          {promo.scopes.length > 2 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              +{promo.scopes.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">No scopes</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/admin/promotions/${promo.code}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Promotions</div>
            <div className="text-2xl font-bold text-gray-900">{promotions.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Active</div>
            <div className="text-2xl font-bold text-green-600">
              {promotions.filter(p => p.is_active).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Inactive</div>
            <div className="text-2xl font-bold text-gray-600">
              {promotions.filter(p => !p.is_active).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Stackable</div>
            <div className="text-2xl font-bold text-purple-600">
              {promotions.filter(p => p.is_stackable).length}
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-6">
          <Link 
            href="/admin" 
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
