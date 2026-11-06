import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seriesIsEmpty } from "../../utils/reportPeriods";

// Categorical slots 1–3 of the validated reference palette (blue, orange, aqua).
// Identity is never color-alone: legend + the pivot table below give the exact numbers.
const SERIES = [
  { key: "revenue", name: "Tổng thu", color: "#2a78d6" },
  { key: "expense", name: "Tổng chi", color: "#eb6834" },
  { key: "profit", name: "Lợi nhuận", color: "#1baf7a" },
];
const CHART_HEIGHT = 320;
const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-semibold text-gray-900">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center gap-2 text-gray-700">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          <span>{item.name}:</span>
          <span className="ml-auto font-medium tabular-nums text-gray-900">{money.format(item.value)} ₫</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Grouped bars of the backend's revenue / expense / profit per period.
 * status: "loading" | "success" | "error". `points` stay visible (dimmed) while a newer request loads,
 * and the box keeps a fixed height in every state, so the page never jumps.
 */
export default function FinancialBarChart({ title, caption, points, status, error, onRetry, highlightKey }) {
  const hasPoints = points.length > 0;
  const empty = hasPoints && seriesIsEmpty(points);
  return (
    <section className="report-table-section report-chart" aria-busy={status === "loading" || undefined}>
      <div className="report-chart-head">
        <div>
          <h2>{title}</h2>
          {caption && <p className="report-note">{caption}</p>}
        </div>
        {status === "loading" && <span role="status" className="report-note">Đang tải…</span>}
      </div>
      <div className="report-chart-body" style={{ height: CHART_HEIGHT }}>
        {status === "error" && !hasPoints ? (
          <div className="report-chart-state" role="alert">
            <p>{error || "Không tải được dữ liệu biểu đồ."}</p>
            {onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}
          </div>
        ) : !hasPoints ? (
          <div className="report-chart-state"><div className="report-chart-skeleton" /></div>
        ) : empty ? (
          <div className="report-chart-state"><p>Không có hóa đơn hoặc phiếu nhập trong khoảng thời gian này.</p></div>
        ) : (
          <div style={{ height: "100%", opacity: status === "loading" ? 0.55 : 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#d1d5db" }} tick={{ fill: "#4b5563", fontSize: 13 }} />
                <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "#6b7280", fontSize: 12 }} tickFormatter={(value) => compact.format(value)} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(99 102 241 / 0.06)" }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: "#374151" }} />
                {SERIES.map((series) => (
                  <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {highlightKey && points.map((point) => (
                      <Cell key={point.key} fillOpacity={point.key === highlightKey ? 1 : 0.35} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {status === "error" && hasPoints && (
        <p role="alert" className="report-error">{error} {onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</p>
      )}
    </section>
  );
}
