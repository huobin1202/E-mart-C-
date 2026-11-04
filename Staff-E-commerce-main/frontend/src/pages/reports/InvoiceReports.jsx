import { useEffect, useState } from 'react';
import { invoiceStatistics, vietnamToday } from '../../api/invoiceStatisticsApi';
import { getAllCategories } from '../../api/categoryApi';
import './invoiceReports.css';

const money = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);

function PivotTable({ table, start = 0, end = table.columns.length }) {
  return <table>
    <thead><tr><th>Chỉ tiêu / Đối tượng</th>{table.columns.slice(start, end).map(c => <th key={c}>{c}</th>)}<th>TC toàn kỳ</th></tr></thead>
    <tbody>{table.rows.map((row, index) => <tr key={index}><th>{row.label}{row.price != null && <small style={{ display: 'block', fontWeight: 400 }}>Giá bán: {money(row.price)} ₫</small>}</th>{row.values.slice(start, end).map((v, c) => <td key={c}>{money(v)}</td>)}<td><strong>{money(row.total)}</strong></td></tr>)}</tbody>
    {table.totals.length > 0 && <tfoot><tr><th>Tổng cộng</th>{table.totals.slice(start, end).map((v, c) => <td key={c}>{money(v)}</td>)}<td>{money(table.grandTotal)}</td></tr></tfoot>}
  </table>;
}

export function DailyInvoiceSummary() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const today = vietnamToday();
      setData(await invoiceStatistics({ from: today, to: today, period: 'year' }));
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return <section className="invoice-report daily-invoices">
    <div className="report-toolbar"><h2>Hóa đơn hôm nay (giờ Việt Nam)</h2><button onClick={load} disabled={loading}>{loading ? 'Đang tải…' : 'Làm mới'}</button></div>
    {error && <p role="alert">{error}</p>}
    {data && <div className="report-kpis"><div>Tổng tiền trong ngày<strong>{money(data.revenue)} ₫</strong></div><div>Số hóa đơn đã thanh toán<strong>{data.invoiceCount}</strong></div></div>}
    <small>Dữ liệu cache 10 phút; cập nhật lại sau thay đổi dữ liệu.</small>
  </section>;
}

export default function InvoiceReports() {
  const today = vietnamToday();
  const [filters, setFilters] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today, period: 'quarter' });
  const [applied, setApplied] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productSort, setProductSort] = useState('name');
  const [productError, setProductError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  async function load(next, productOnly = false) {
    if (!next.from || !next.to || next.from > next.to) { setError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.'); return; }
    setBusy(true); setError(''); setProductError('');
    try { setReport(await invoiceStatistics(next)); setApplied({ ...next }); }
    catch (e) { if (productOnly) setProductError(e.message); else setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load({ from: `${today.slice(0, 4)}-01-01`, to: today, period: 'quarter' }); }, [today]);
  useEffect(() => { getAllCategories().then(setCategories).catch(() => setCategoryError('Không tải được danh mục. Vui lòng tải lại trang.')); }, []);
  function applyProducts(event) {
    event.preventDefault();
    load({ ...applied, productSearch: productSearch.trim(), categoryId: categoryId || undefined, productSort }, true);
  }
  function clearProducts() {
    setProductSearch(''); setCategoryId(''); setProductSort('name');
    load({ ...applied, productSearch: undefined, categoryId: undefined, productSort: 'name' }, true);
  }
  async function exportExcel() {
    setBusy(true); setError('');
    try {
      const blob = await invoiceStatistics({ ...applied, snapshotId: report.snapshotId }, 'xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'thong-ke-hoa-don.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <main className="invoice-report p-6">
    <h1>Báo cáo thống kê hóa đơn</h1>
    <div className="report-controls">
      <label>Từ ngày<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}/></label>
      <label>Đến ngày<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}/></label>
      <label>Cột thời gian<select value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm / so sánh các năm</option></select></label>
      <button disabled={busy} onClick={() => load({ ...applied, ...filters })}>{busy ? 'Đang xử lý…' : 'Xem báo cáo'}</button>
      <button disabled={!report || busy} onClick={exportExcel}>Xuất Excel</button>
      <button disabled={!report || busy} onClick={() => window.print()}>In / Lưu PDF</button>
    </div>
    {error && <p role="alert" className="report-error">{error}</p>}
    {report && <div className="invoice-report-print">
      <h2>THỐNG KÊ HÓA ĐƠN · {applied.from} — {applied.to}</h2>
      <div className="report-kpis">
        <div>Tổng thu<strong>{money(report.revenue)} ₫</strong></div>
        <div>Số hóa đơn<strong>{report.invoiceCount}</strong></div>
        <div>Tổng chi nhập hàng<strong>{money(report.expense)} ₫</strong></div>
        <div>Lợi nhuận (thu − chi)<strong>{money(report.profit)} ₫</strong></div>
      </div>
      <p className="report-policy">{report.policy}</p>
      {report.invoiceCount === 0 && <p>Không có hóa đơn đủ điều kiện trong khoảng ngày đã chọn.</p>}
      {report.tables.map(table => <section key={table.title} className="report-table-section">
        <div className="report-screen-only">
          <h2>{table.title}</h2>
          {table.title.startsWith('Sản phẩm') && <>
            <p>Chỉ áp dụng cho bảng sản phẩm. Sắp xếp theo giá bán hiện tại (₫). Nhấn Áp dụng hoặc Enter để cập nhật.</p>
            <form className="product-report-filters" onSubmit={applyProducts}>
              <label>Tìm sản phẩm / SKU<input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Tên có dấu, không dấu hoặc SKU" /></label>
              <label>Danh mục<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Sắp xếp<select aria-label="Sắp xếp sản phẩm" value={productSort} onChange={e => setProductSort(e.target.value)}><option value="name">Tên sản phẩm A–Z</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option></select></label>
              <button type="submit" disabled={busy}>Áp dụng</button>
              <button type="button" disabled={busy} onClick={clearProducts}>Xóa lọc</button>
            </form>
            {(productError || categoryError) && <p role="alert" className="report-error">{productError || categoryError}</p>}
            <p role="status">Tìm thấy {table.rows.length} dòng sản phẩm. Tổng sau lọc: {money(table.grandTotal)} ₫.</p>
          </>}
          {table.filterDescription && <p className="report-policy">{table.filterDescription}</p>}
          {table.rows.length === 0 && <p>Không có dữ liệu phù hợp bộ lọc.</p>}
          <div className="report-scroll"><PivotTable table={table}/></div>
        </div>
        <div className="report-print-only">{Array.from({ length: Math.ceil(table.columns.length / 8) }, (_, index) => <div className="report-print-part" key={index}>
          <h2>{table.title} · {table.columns[index * 8]} — {table.columns[Math.min(index * 8 + 7, table.columns.length - 1)]}</h2>
          {table.filterDescription && <p>{table.filterDescription}</p>}
          <PivotTable table={table} start={index * 8} end={index * 8 + 8}/>
        </div>)}</div>
      </section>)}
    </div>}
  </main>;
}
