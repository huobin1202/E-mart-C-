import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const colors = ['#4f7dd4', '#df783d', '#52a982', '#9364cb', '#0891b2', '#ca8a04'];
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export default function PivotBarChart({ table }) {
  const product = table.title.startsWith('Sản phẩm');
  const horizontal = table.title.startsWith('Khách hàng');
  const years = [...new Set(table.columns.map(column => column.split('/')[0]))];
  const [chosenYear, setChosenYear] = useState('');
  const year = years.includes(chosenYear) ? chosenYear : years[years.length - 1];
  const ranked = [...table.rows].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const rows = ranked.slice(0, product ? 5 : 10);
  const series = product ? rows.map((row, index) => ({ key: `product${index}`, label: row.label }))
    : table.columns.map((column, index) => ({ key: `period${index}`, label: column }));
  const points = product ? table.columns.flatMap((column, index) => column.split('/')[0] === year
    ? [Object.fromEntries([['label', column], ...rows.map((row, ri) => [`product${ri}`, Number(row.values?.[index] ?? 0)])])] : [])
    : rows.map(row => Object.fromEntries([
    ['label', row.label], ...table.columns.map((_, index) => [`period${index}`, Number(row.values?.[index] ?? 0)]),
  ]));
  const hasRevenue = points.some(point => series.some(item => point[item.key] !== 0));
  const chartHeight = horizontal
    ? Math.max(220, rows.length * Math.max(28, series.length * 10 + 8) + 56)
    : product ? 220 : Math.min(260, Math.max(180, table.rows.length * 34 + 32));

  return <section className="pivot-bar-chart" aria-label={`Biểu đồ ${table.title}`}>
    <h3>Biểu đồ doanh thu · {table.title}</h3>
    <p className="report-note">{ranked.length > rows.length ? `${rows.length} đối tượng có doanh thu cao nhất trong ${ranked.length} đối tượng của toàn kỳ. ` : ''}Mỗi màu tương ứng một {product ? 'sản phẩm' : 'năm'}. Đơn vị: đồng.</p>
    {product && years.length > 1 && <label className="pivot-chart-year">Năm <select value={year} onChange={event => setChosenYear(event.target.value)}>{years.map(item => <option key={item}>{item}</option>)}</select></label>}
    {hasRevenue ? <div>
      <div style={{ width: '100%', minWidth: 0, height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} accessibilityLayer>
            <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="#e2e8f0" />
            {horizontal ? <>
              <XAxis type="number" tickFormatter={value => compact.format(value)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" interval={0} width={140} tick={{ fontSize: 12 }}
                tickFormatter={label => label.length > 20 ? `${label.slice(0, 19)}…` : label} tickLine={false} axisLine={false} />
            </> : <>
              <XAxis dataKey="label" interval={0} height={40} tick={{ fontSize: 11 }} tickFormatter={label => label.length > 20 ? `${label.slice(0, 19)}…` : label} />
              <YAxis width={70} tickCount={4} tickFormatter={value => compact.format(value)} tick={{ fontSize: 12 }} />
            </>}
            <Tooltip formatter={value => money.format(value)} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
            {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label}
              fill={colors[index % colors.length]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 26} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div> : <p className="report-chart-state" style={{ minHeight: 120 }}>Chưa có doanh thu trong khoảng thời gian và bộ lọc đã chọn.</p>}
  </section>;
}
