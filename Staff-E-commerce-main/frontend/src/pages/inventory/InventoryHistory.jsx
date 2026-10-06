// src/pages/inventory/InventoryHistory.jsx
import React, { useEffect, useState, useCallback } from "react";
import { getInventoryAdjustmentHistory } from "../../api/inventoryApi";
import { formatPrice } from "../../utils/formatPrice";

function formatDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ChangeAmountBadge({ amount }) {
  const isPositive = amount > 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold
      ${isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {isPositive ? "▲" : "▼"} {isPositive ? "+" : ""}{amount}
    </span>
  );
}

export default function InventoryHistory() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ totalItems: 0, totalPages: 1, currentPage: 1, pageSize: 20 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInventoryAdjustmentHistory(p, 20, null, debouncedSearch);
      setItems(Array.isArray(data.items) ? data.items : []);
      setMeta({
        totalItems: data.totalItems || 0,
        totalPages: data.totalPages || 1,
        currentPage: data.currentPage || p,
        pageSize: data.pageSize || 20,
      });
    } catch (err) {
      setError(err.message || "Không thể tải lịch sử biến động kho");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Tìm theo sản phẩm, SKU, lý do, nhân viên..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={() => fetchHistory(page)}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition"
        >
          🔄 Làm mới
        </button>
      </div>

      {/* Số liệu tổng quan */}
      <div className="text-sm text-gray-500">
        Tổng <strong>{meta.totalItems}</strong> lần điều chỉnh kho
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">STT</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sản phẩm</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Thay đổi</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lý do</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nhân viên</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Thời gian</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-red-500">{error}</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  {debouncedSearch ? "Không tìm thấy kết quả" : "Chưa có lịch sử điều chỉnh kho"}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{(meta.currentPage - 1) * meta.pageSize + idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{item.productName || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <ChangeAmountBadge amount={item.changeAmount} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                    <span className="truncate block" title={item.reason}>
                      {item.reason || <span className="text-gray-300 italic">Không có lý do</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.userName || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(item.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Hiển thị {(meta.currentPage - 1) * meta.pageSize + 1}–{Math.min(meta.currentPage * meta.pageSize, meta.totalItems)} / {meta.totalItems}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"
            >Đầu</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"
            >Trước</button>
            <span className="px-3 py-1 rounded-lg border bg-indigo-50 text-indigo-700 font-medium">
              {meta.currentPage}/{meta.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"
            >Sau</button>
            <button
              onClick={() => setPage(meta.totalPages)}
              disabled={page === meta.totalPages}
              className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"
            >Cuối</button>
          </div>
        </div>
      )}
    </div>
  );
}
