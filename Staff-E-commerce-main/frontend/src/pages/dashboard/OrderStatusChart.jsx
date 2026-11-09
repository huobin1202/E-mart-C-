import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function OrderStatusChart({ orderStats }) {
  const { data, total } = useMemo(() => {
    if (!orderStats) return { data: [], total: 0 };
    const d = [
      { name: 'Hoàn tất', value: orderStats.completedOrders ?? 0 },
      { name: 'Chờ xử lý', value: orderStats.pendingOrders ?? 0 },
      { name: 'Đang xử lý', value: orderStats.processingOrders ?? 0 },
      { name: 'Đã hủy', value: orderStats.cancelledOrders ?? 0 },
    ];
    const t = orderStats.totalOrders ?? d.reduce((s, it) => s + it.value, 0);
    return { data: d, total: t };
  }, [orderStats]);

  const formatPercent = (v) => {
    if (!total) return '0%';
    return `${Math.round((v / total) * 100)}%`;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Trạng thái đơn hàng · 7 ngày gần đây</h2>
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-full md:w-1/2 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} (${formatPercent(v)})`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full md:w-1/2">
          <ul className="space-y-3">
            {data.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-700">{s.name}</span>
                </div>
                <div className="text-gray-900 font-semibold">
                  {s.value} <span className="text-gray-500 text-sm">({formatPercent(s.value)})</span>
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between border-t pt-2 mt-1">
              <span className="text-gray-500">Tổng đơn</span>
              <span className="font-bold">{total}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
