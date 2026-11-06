// src/pages/dashboard/Dashboard.jsx
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { DailyInvoiceSummary } from "../reports/InvoiceReports";
import RevenueChart from "./RevenueChart";
import TopProductsChart from "./TopProductsChart";
import OrderStatusChart from "./OrderStatusChart";
import LowStockAlert from "./LowStockAlert";
import { fetchDashboard } from "../../features/statistics/statisticsSlice";

export default function Dashboard() {

  const dispatch = useDispatch();
  const { revenue, bestSellers, lowStock, orderStats, loading, error } =
    useSelector((s) => s.statistics);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  // The layout is rendered from the first frame; charts fill in when data arrives
  // (the old full-page "Đang tải" swap made the whole dashboard jump on every visit).
  return (
    <div>
      <div className="max-w-7xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Tổng quan</h1>
          {loading && <span role="status" className="text-sm text-gray-500">Đang tải số liệu…</span>}
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{typeof error === "string" ? error : "Không tải được số liệu tổng quan."} <button type="button" className="ml-2 underline" onClick={() => dispatch(fetchDashboard())}>Thử lại</button></p>}

        <DailyInvoiceSummary />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" aria-busy={loading || undefined} style={{ opacity: loading ? 0.6 : 1 }}>
          <RevenueChart data={revenue} />
          <TopProductsChart data={bestSellers} />
          <OrderStatusChart orderStats={orderStats} />
          <LowStockAlert items={lowStock} />
        </div>
      </div>
    </div>
  );
}
