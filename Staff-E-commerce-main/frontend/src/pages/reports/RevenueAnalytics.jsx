import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, TrendingUp, Users, UserRound, Package, ReceiptText, ChevronLeft, ChevronRight } from "lucide-react";

const API = "http://localhost:5099/api/revenue-analytics";
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const sections = [
  { id: "financial", title: "Tài chính", description: "Doanh thu, chi phí nhập hàng và lợi nhuận theo quý.", icon: TrendingUp },
  { id: "employees", title: "Nhân viên", description: "So sánh doanh thu từng nhân viên qua các năm.", icon: Users },
  { id: "customers", title: "Khách hàng", description: "Theo dõi giá trị mua hàng theo khách hàng và năm.", icon: UserRound },
  { id: "products", title: "Doanh thu theo sản phẩm", description: "So sánh tiền hàng của từng sản phẩm qua các quý.", icon: Package },
];
const labels = { financial: "Chỉ tiêu", employees: "Nhân viên", customers: "Khách hàng", products: "Sản phẩm" };

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ReportTable({ section, columns, rows, quantity = false, exporting, onExport }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const detailRows = useMemo(() => {
    const detail = rows.filter(row => row.label !== "Tổng cộng");
    return section === "financial" ? detail : [...detail].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  }, [rows, section]);
  const totalRow = rows.find(row => row.label === "Tổng cộng");
  const pageCount = Math.max(1, Math.ceil(detailRows.length / pageSize));
  const visible = detailRows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [section, columns.join("|")]);
  const format = value => quantity ? Number(value ?? 0).toLocaleString("vi-VN") : money.format(value ?? 0);

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><h2 className="text-lg font-semibold text-slate-900">{sections.find(s => s.id === section)?.title}</h2><p className="mt-1 text-sm text-slate-500">{section === "financial" ? "Lợi nhuận = doanh thu − chi nhập hàng" : `${detailRows.length.toLocaleString("vi-VN")} ${labels[section].toLowerCase()}`}</p></div>
      <button onClick={() => onExport(section)} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={16} />{exporting ? "Đang xuất…" : "Xuất Excel"}</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="sticky left-0 z-[1] min-w-52 bg-slate-50 px-4 py-3 text-left">{labels[section]}</th>{columns.map(c => <th key={c} className="min-w-32 whitespace-nowrap px-4 py-3 text-right">{c}</th>)}<th className="min-w-36 whitespace-nowrap px-4 py-3 text-right">Tổng cộng</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map((row, ri) => <tr key={`${row.id ?? row.label}-${ri}`} className={row.label === "Lợi nhuận" ? "bg-emerald-50 font-semibold text-emerald-900" : "hover:bg-slate-50"}><td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-700">{row.label}</td>{columns.map((_, i) => <td key={i} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">{format(row.values?.[i])}</td>)}<td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{format(row.total)}</td></tr>)}
          {totalRow && <tr className="border-t-2 border-slate-300 bg-indigo-50 font-bold text-indigo-950"><td className="sticky left-0 bg-indigo-50 px-4 py-3">Tổng cộng</td>{columns.map((_, i) => <td key={i} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{format(totalRow.values?.[i])}</td>)}<td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{format(totalRow.total)}</td></tr>}
        </tbody>
      </table>
      {!rows.length && <p className="px-5 py-12 text-center text-slate-500">Không có dữ liệu trong khoảng năm đã chọn.</p>}
    </div>
    {detailRows.length > 0 && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>Hiển thị {((page - 1) * pageSize + 1).toLocaleString("vi-VN")}–{Math.min(page * pageSize, detailRows.length).toLocaleString("vi-VN")} / {detailRows.length.toLocaleString("vi-VN")}</span>
      <div className="flex items-center gap-2"><button aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button><span className="min-w-20 text-center">Trang {page} / {pageCount}</span><button aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button></div>
    </footer>}
  </section>;
}

export default function RevenueAnalytics() {
  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(String(currentYear));
  const [toYear, setToYear] = useState(String(currentYear));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ fromYear: String(currentYear), toYear: String(currentYear), from: "", to: "" });
  const [active, setActive] = useState("financial");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const params = filters => new URLSearchParams({ fromYear: filters.fromYear, toYear: filters.toYear, ...(filters.from && { from: filters.from }), ...(filters.to && { to: filters.to }) });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}?${params(appliedFilters)}`, { headers: authHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Không thể tải báo cáo.");
      setReport(body);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [appliedFilters]);
  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    const startYear = Number(fromYear);
    const endYear = Number(toYear);
    if (!fromYear || !toYear || !Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 2000 || endYear > 2200 || startYear > endYear || endYear - startYear > 9) {
      setError("Vui lòng chọn năm hợp lệ, tối đa 10 năm trong khoảng 2000–2200.");
      return;
    }
    if (from && to && from > to) {
      setError("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.");
      return;
    }
    setError("");
    setAppliedFilters({ fromYear, toYear, from, to });
  };

  const exportReport = async section => {
    setExporting(true); setError("");
    try {
      const res = await fetch(`${API}/export/${section}?${params(appliedFilters)}`, { headers: authHeaders() });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || "Xuất Excel thất bại."); }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `bao-cao-${section}-${appliedFilters.fromYear}-${appliedFilters.toYear}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
    finally { setExporting(false); }
  };

  const sectionData = active === "financial"
    ? { columns: [...(report?.financeColumns ?? []), ""], rows: report?.financialRows ?? [] }
    : active === "employees" ? { columns: report?.yearColumns ?? [], rows: report?.employeeRows ?? [] }
    : active === "customers" ? { columns: report?.yearColumns ?? [], rows: report?.customerRows ?? [] }
    : { columns: report?.productColumns ?? [], rows: report?.productRows ?? [] };
  // Financial values already have the grand-total column represented by row.total.
  if (active === "financial") sectionData.columns = report?.financeColumns ?? [];

  return <div className="mx-auto min-w-0 max-w-[1600px] space-y-5 pb-8">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-700"><ReceiptText size={17} />Báo cáo quản lý cửa hàng</div><h1 className="text-2xl font-bold text-slate-900">Thống kê & doanh thu</h1><p className="mt-1 text-sm text-slate-600">Chọn một báo cáo để xem chi tiết. Mỗi bảng có thể xuất Excel riêng.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Làm mới</button></div>
      <div className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="text-xs font-semibold text-slate-600">Từ năm<input type="number" min="2000" max="2200" step="1" inputMode="numeric" value={fromYear} onChange={e => setFromYear(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Đến năm<input type="number" min="2000" max="2200" step="1" inputMode="numeric" value={toYear} onChange={e => setToYear(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Đến ngày<input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <div className="rounded-md border border-indigo-100 bg-white px-3 py-2"><div className="text-xs font-medium text-slate-500">Doanh thu theo ngày</div><div className="mt-1 font-bold text-indigo-700">{money.format(report?.periodRevenue ?? 0)}</div></div>
        <button onClick={applyFilters} disabled={loading} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Áp dụng</button>
      </div>
    </header>
    <nav aria-label="Các loại báo cáo" className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">{sections.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setActive(id)} aria-current={active === id ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${active === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={17} />{title}</button>)}</nav>
    <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-600">{sections.find(s => s.id === active)?.description}</p>{loading && <span className="shrink-0 text-sm text-slate-500">Đang tải…</span>}</div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {report ? <ReportTable key={active} section={active} columns={sectionData.columns} rows={sectionData.rows} exporting={exporting} onExport={exportReport} /> : <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">{loading ? "Đang tổng hợp dữ liệu…" : "Chưa có dữ liệu báo cáo."}</div>}
    <p className="text-xs text-slate-500">Doanh thu lấy từ đơn hoàn tất đã thanh toán; giao dịch hoàn tiền được trừ. Chi phí lấy từ phiếu nhập hoàn tất. Lợi nhuận = doanh thu − chi nhập hàng.</p>
  </div>;
}
