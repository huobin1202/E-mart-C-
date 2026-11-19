import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

export default function ProductQuarterChart({ row, columns, onClose, period = "quý", entity = "sản phẩm" }) {
  const points = columns.map((quarter, index) => ({ quarter, revenue: Number(row.values?.[index] ?? 0) }));

  return <section aria-label={`Biểu đồ doanh thu theo ${period}: ${row.label}`} className="w-[420px] max-w-[75vw] rounded-lg border border-indigo-200 bg-white p-3 text-left font-normal text-slate-700 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-slate-900">{row.label}</h3>
        <p className="mt-1 text-xs text-slate-500">Doanh thu theo {period} · Tổng: {money.format(row.total ?? 0)}</p>
      </div>
      <button type="button" onClick={event => { event.stopPropagation(); onClose(); }} aria-label={`Đóng biểu đồ ${entity}`} className="shrink-0 rounded p-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600"><X size={16} /></button>
    </div>
    {points.length ? <div className="mt-3 overflow-x-auto">
      <div style={{ width: Math.max(360, points.length * 64), height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 12, right: 12, bottom: 12, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="quarter" interval={0} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis width={64} tickFormatter={value => compact.format(value)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={value => [money.format(value), "Doanh thu"]} cursor={{ fill: "#eef2ff" }} />
            <Bar dataKey="revenue" name="Doanh thu" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div> : <p className="py-8 text-center text-sm text-slate-500">Chưa có dữ liệu theo {period}.</p>}
    <p className="text-xs text-slate-500">Đơn vị: đồng. Di chuột vào cột để xem số tiền chi tiết.</p>
  </section>;
}
