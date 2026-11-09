import React from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function TopProductsChart({ data }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Top 5 sản phẩm bán chạy · 7 ngày gần đây</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="productName" width={160} />
          <Tooltip />
          <Bar dataKey="quantitySold" fill="#10b981" name="Số lượng bán" barSize={18} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
