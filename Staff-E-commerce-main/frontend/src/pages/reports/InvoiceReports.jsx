import { useCallback, useEffect, useState } from 'react';
import FinancialBarChart from './FinancialBarChart';
import { useLatestRequest } from '../../hook/useLatestRequest';
import { MAX_YEAR_SPAN, QUARTERS, clipRange, currentQuarter, financialSeries, formatViDate, isFutureQuarter, quarterRange, validateDateRange, yearRange, yearsWithData } from '../../utils/reportPeriods';
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

export function DailyInvoiceSummary({ onRefresh } = {}) {
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
    <div className="report-toolbar"><h2>Hóa đơn hôm nay (giờ Việt Nam)</h2><button onClick={() => { load(); onRefresh?.(); }} disabled={loading}>{loading ? 'Đang tải…' : 'Làm mới'}</button></div>
    {error && <p role="alert" className="report-error">{error}</p>}
    {data && <div className="report-kpis"><div>Tổng tiền trong ngày<strong>{money(data.revenue)} ₫</strong></div><div>Số hóa đơn đã thanh toán<strong>{data.invoiceCount}</strong></div></div>}
    <small className="report-note">Dữ liệu cache 10 phút; cập nhật lại sau thay đổi dữ liệu.</small>
  </section>;
}

const FINANCIAL_TITLE = 'Tổng thu, tổng chi và lợi nhuận';
const findFinancial = report => report?.tables?.find(table => table.title === FINANCIAL_TITLE) ?? report?.tables?.[0];

/** What a request covers. The label shown above the numbers always comes from the data's own request. */
function reportRequest(selection, today) {
  if (selection.mode === 'range') {
    return { from: selection.from, to: selection.to, period: selection.period, label: `${formatViDate(selection.from)} – ${formatViDate(selection.to)}` };
  }
  const range = clipRange(quarterRange(selection.year, selection.quarter), today);
  // Inside one quarter the pivot shows its three months; the chart below compares the quarters of the year.
  return { ...range, period: 'month', label: `Q${selection.quarter}/${selection.year} · ${formatViDate(range.from)} – ${formatViDate(range.to)}` };
}

export default function InvoiceReports() {
  const today = vietnamToday();
  const initial = currentQuarter(today);
  const defaultSelection = { mode: 'quarter', year: initial.year, quarter: initial.quarter, from: `${initial.year}-01-01`, to: today, period: 'quarter' };
  const [selection, setSelection] = useState(defaultSelection);
  const [draftRange, setDraftRange] = useState({ from: defaultSelection.from, to: defaultSelection.to, period: 'quarter' });
  const [rangeError, setRangeError] = useState('');
  const [years, setYears] = useState([initial.year]);
  const [applied, setApplied] = useState(null);
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('loading');
  const [error, setError] = useState('');
  const [chart, setChart] = useState({ points: [], title: '', caption: '', highlightKey: null });
  const [chartStatus, setChartStatus] = useState('loading');
  const [chartError, setChartError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productSort, setProductSort] = useState('name');
  const [productError, setProductError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const runReport = useLatestRequest();
  const runChart = useLatestRequest();
  const busy = reportStatus === 'loading' || exporting;

  const loadReport = useCallback(async (next, productOnly = false) => {
    setReportStatus('loading'); setError(''); setProductError('');
    const { from, to, period, productSearch: search, categoryId: category, productSort: sort } = next;
    const outcome = await runReport(signal => invoiceStatistics({ from, to, period, productSearch: search, categoryId: category, productSort: sort }, 'json', { signal }));
    if (outcome.stale) return;
    if (outcome.error) {
      setReportStatus('error');
      if (productOnly) setProductError(outcome.error.message); else setError(outcome.error.message);
      return;
    }
    setReport(outcome.result); setApplied({ ...next }); setReportStatus('success');
    if (next.mode === 'range') {
      setChart({ points: financialSeries(findFinancial(outcome.result)), title: 'Biểu đồ thu – chi – lợi nhuận', caption: `${next.label} · gom theo ${periodNames[next.period]}`, highlightKey: null });
      setChartStatus('success');
    }
  }, [runReport]);

  // Quarter mode: the bar chart compares every quarter of the selected year (up to today), the selected one highlighted.
  const loadQuarterChart = useCallback(async (year, quarter) => {
    setChartStatus('loading'); setChartError('');
    const range = clipRange(yearRange(year), today);
    const outcome = await runChart(signal => invoiceStatistics({ ...range, period: 'quarter' }, 'json', { signal }));
    if (outcome.stale) return;
    if (outcome.error) { setChartStatus('error'); setChartError(outcome.error.message); return; }
    setChart({ points: financialSeries(findFinancial(outcome.result)), title: `Biểu đồ theo quý · năm ${year}`, caption: `Đang xem Q${quarter}/${year} (cột đậm). Dữ liệu từ ${formatViDate(range.from)} đến ${formatViDate(range.to)}.`, highlightKey: `${year}/Q${quarter}` });
    setChartStatus('success');
  }, [runChart, today]);

  const productFilters = () => ({ productSearch: productSearch.trim() || undefined, categoryId: categoryId || undefined, productSort });

  const apply = (next, keepProductFilters = true) => {
    const request = { mode: next.mode, year: next.year, quarter: next.quarter, ...reportRequest(next, today), ...(keepProductFilters ? productFilters() : { productSort: 'name' }) };
    setSelection(next);
    loadReport(request);
    if (next.mode === 'quarter') loadQuarterChart(next.year, next.quarter);
  };

  useEffect(() => {
    apply(defaultSelection, false);
    // Years that have data: one yearly request over the longest span the backend allows.
    invoiceStatistics({ from: `${initial.year - MAX_YEAR_SPAN}-01-01`, to: today, period: 'year' })
      .then(result => setYears(yearsWithData(findFinancial(result), initial.year)))
      .catch(() => setYears(Array.from({ length: 5 }, (_, i) => initial.year - i)));
    getAllCategories().then(setCategories).catch(() => setCategoryError('Không tải được danh mục. Vui lòng tải lại trang.'));
    // Runs once on open; later loads are triggered by the filter controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseYear = year => {
    const quarter = isFutureQuarter(year, selection.quarter, today) ? currentQuarter(today).quarter : selection.quarter;
    apply({ ...selection, mode: 'quarter', year, quarter });
  };
  const chooseQuarter = quarter => apply({ ...selection, mode: 'quarter', quarter });
  const switchMode = mode => {
    if (mode === selection.mode) return;
    setRangeError('');
    if (mode === 'quarter') apply({ ...selection, mode });
    else setSelection({ ...selection, mode }); // a date range is applied with the "Xem báo cáo" button
  };
  const applyRange = event => {
    event.preventDefault();
    const message = validateDateRange(draftRange.from, draftRange.to);
    setRangeError(message);
    if (!message) apply({ ...selection, mode: 'range', ...draftRange });
  };
  const resetToCurrent = () => {
    setProductSearch(''); setCategoryId(''); setProductSort('name'); setRangeError('');
    setDraftRange({ from: defaultSelection.from, to: defaultSelection.to, period: 'quarter' });
    apply(defaultSelection, false);
  };

  function applyProducts(event) {
    event.preventDefault();
    if (!applied) return;
    loadReport({ ...applied, productSearch: productSearch.trim(), categoryId: categoryId || undefined, productSort }, true);
  }
  function clearProducts() {
    setProductSearch(''); setCategoryId(''); setProductSort('name');
    if (applied) loadReport({ ...applied, productSearch: undefined, categoryId: undefined, productSort: 'name' }, true);
  }
  async function exportExcel() {
    setExporting(true); setError('');
    try {
      const { from, to, period, productSearch: search, categoryId: category, productSort: sort } = applied;
      const blob = await invoiceStatistics({ from, to, period, productSearch: search, categoryId: category, productSort: sort, snapshotId: report.snapshotId }, 'xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'thong-ke-hoa-don.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
    finally { setExporting(false); }
  }

  const retryChart = () => (selection.mode === 'quarter' ? loadQuarterChart(selection.year, selection.quarter) : applied && loadReport(applied));
  const isQuarter = selection.mode === 'quarter';

  return <section className="invoice-report">
    <h1>Báo cáo thống kê hóa đơn</h1>
    <div className="report-controls report-period-controls">
      <div role="radiogroup" aria-label="Kiểu lọc thời gian" className="report-segmented">
        <button type="button" role="radio" aria-checked={isQuarter} className={isQuarter ? 'is-active' : ''} onClick={() => switchMode('quarter')}>Theo quý</button>
        <button type="button" role="radio" aria-checked={!isQuarter} className={!isQuarter ? 'is-active' : ''} onClick={() => switchMode('range')}>Theo khoảng ngày</button>
      </div>
      {isQuarter ? <>
        <label>Năm<select value={selection.year} onChange={e => chooseYear(Number(e.target.value))}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <div className="report-quarters" role="radiogroup" aria-label="Quý">
          {QUARTERS.map(quarter => {
            const future = isFutureQuarter(selection.year, quarter, today);
            const active = selection.quarter === quarter;
            return <button key={quarter} type="button" role="radio" aria-checked={active} disabled={future}
              title={future ? 'Quý chưa bắt đầu' : `Q${quarter}/${selection.year}`}
              className={active ? 'is-active' : ''} onClick={() => chooseQuarter(quarter)}>Q{quarter}</button>;
          })}
        </div>
      </> : <form className="report-range" onSubmit={applyRange} noValidate>
        <label>Từ ngày<input type="date" value={draftRange.from} max={draftRange.to || undefined} aria-invalid={Boolean(rangeError) || undefined} onChange={e => { setDraftRange({ ...draftRange, from: e.target.value }); setRangeError(''); }} /></label>
        <label>Đến ngày<input type="date" value={draftRange.to} min={draftRange.from || undefined} aria-invalid={Boolean(rangeError) || undefined} onChange={e => { setDraftRange({ ...draftRange, to: e.target.value }); setRangeError(''); }} /></label>
        <label>Gom theo<select value={draftRange.period} onChange={e => setDraftRange({ ...draftRange, period: e.target.value })}><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm / so sánh các năm</option></select></label>
        <button type="submit" className="report-primary" disabled={reportStatus === 'loading'}>Xem báo cáo</button>
      </form>}
      <button type="button" onClick={resetToCurrent} disabled={reportStatus === 'loading'}>Về quý hiện tại</button>
      <span className="report-controls-spacer" />
      <button type="button" disabled={!report || busy} onClick={exportExcel}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button>
      <button type="button" disabled={!report || busy} onClick={() => window.print()}>In / Lưu PDF</button>
    </div>
    {rangeError && <p role="alert" className="report-error">{rangeError}</p>}
    {error && <p role="alert" className="report-error">{error} {applied && <button type="button" onClick={() => loadReport(applied)}>Thử lại</button>}</p>}

    <FinancialBarChart title={chart.title || 'Biểu đồ thu – chi – lợi nhuận'} caption={chart.caption} points={chart.points}
      status={isQuarter ? chartStatus : reportStatus} error={isQuarter ? chartError : error} onRetry={retryChart} highlightKey={isQuarter ? chart.highlightKey : null} />

    {!report && reportStatus === 'loading' && <p role="status" className="report-note">Đang tổng hợp báo cáo…</p>}
    {report && applied && <div className="invoice-report-print" aria-busy={reportStatus === 'loading' || undefined} style={{ opacity: reportStatus === 'loading' ? 0.6 : 1 }}>
      <h2>THỐNG KÊ HÓA ĐƠN · {applied.label}</h2>
      <div className="report-kpis">
        <div>Tổng thu<strong>{money(report.revenue)} ₫</strong></div>
        <div>Số hóa đơn<strong>{report.invoiceCount}</strong></div>
        <div>Tổng chi nhập hàng<strong>{money(report.expense)} ₫</strong></div>
        <div>Lợi nhuận (thu − chi)<strong>{money(report.profit)} ₫</strong></div>
      </div>
      <p className="report-policy">{report.policy}</p>
      {report.invoiceCount === 0 && <p>Không có hóa đơn đủ điều kiện trong khoảng thời gian đã chọn.</p>}
      {report.tables.map(table => <section key={table.title} className="report-table-section">
        <div className="report-screen-only">
          <h2>{table.title}</h2>
          {table.title.startsWith('Sản phẩm') && <>
            <p>Chỉ áp dụng cho bảng sản phẩm. Sắp xếp theo giá bán hiện tại (₫). Nhấn Áp dụng hoặc Enter để cập nhật.</p>
            <form className="product-report-filters" onSubmit={applyProducts}>
              <label>Tìm sản phẩm / SKU<input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Tên có dấu, không dấu hoặc SKU" /></label>
              <label>Danh mục<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Sắp xếp<select aria-label="Sắp xếp sản phẩm" value={productSort} onChange={e => setProductSort(e.target.value)}><option value="name">Tên sản phẩm A–Z</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option></select></label>
              <button type="submit" className="report-primary" disabled={busy}>Áp dụng</button>
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
  </section>;
}

const periodNames = { month: 'tháng', quarter: 'quý', year: 'năm' };
