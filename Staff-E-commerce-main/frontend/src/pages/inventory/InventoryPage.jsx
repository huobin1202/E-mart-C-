// src/pages/inventory/InventoryPage.jsx
// Trang wrapper với 2 tab: Danh sách tồn kho + Lịch sử biến động
import React, { useState } from "react";
import InventoryList from "./InventoryList";
import InventoryHistory from "./InventoryHistory";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("list");

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📦 Quản lý Tồn kho</h1>
            <p className="text-gray-500 text-sm mt-0.5">Theo dõi số lượng tồn kho và lịch sử biến động</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${activeTab === "list"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"}`}
          >
            📦 Danh sách tồn kho
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${activeTab === "history"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"}`}
          >
            📋 Lịch sử biến động
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "list" && <InventoryList embedded />}
        {activeTab === "history" && <InventoryHistory />}
      </div>
    </div>
  );
}
