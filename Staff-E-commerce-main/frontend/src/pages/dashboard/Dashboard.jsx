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
  const { revenue, bestSellers, lowStock, orderStats, loading } =
    useSelector((s) => s.statistics);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  if (loading) {
    return <div className="p-6 text-gray-500">Đang tải dashboard...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Dashboard POS</h1>

        <DailyInvoiceSummary />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <RevenueChart data={revenue} />
          <TopProductsChart data={bestSellers} />
          <OrderStatusChart orderStats={orderStats} />
          <LowStockAlert items={lowStock} />
        </div>
      </div>
    </div>
  );
}
