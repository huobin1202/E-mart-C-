// Calendar quarters and date ranges for the statistics page.
// All dates are "YYYY-MM-DD" strings in Vietnam business time (see vietnamToday()); no Date/UTC
// conversion happens here, so the browser timezone can never shift a day or a quarter.
// The backend filters invoices by Vietnam calendar date, inclusive of both ends.

export const QUARTERS = [1, 2, 3, 4];
export const MAX_YEAR_SPAN = 20; // backend rejects to.Year - from.Year > 20

const pad = (n) => String(n).padStart(2, "0");
const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const parseIsoDate = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
};

export const quarterOfMonth = (month) => Math.floor((month - 1) / 3) + 1;

export const currentQuarter = (todayIso) => {
  const { year, month } = parseIsoDate(todayIso);
  return { year, quarter: quarterOfMonth(month) };
};

/** Q1 01/01–31/03, Q2 01/04–30/06, Q3 01/07–30/09, Q4 01/10–31/12. */
export const quarterRange = (year, quarter) => {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}` };
};

export const yearRange = (year) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

/** A range never asks for days after today (those would only be empty periods). */
export const clipRange = ({ from, to }, todayIso) => ({ from, to: to > todayIso ? todayIso : to });

export const isFutureQuarter = (year, quarter, todayIso) => quarterRange(year, quarter).from > todayIso;

export const validateDateRange = (from, to) => {
  if (!from || !to) return "Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.";
  if (from > to) return "Ngày bắt đầu không được lớn hơn ngày kết thúc.";
  if (parseIsoDate(to).year - parseIsoDate(from).year > MAX_YEAR_SPAN) return `Khoảng thời gian tối đa ${MAX_YEAR_SPAN} năm.`;
  return "";
};

export const formatViDate = (iso) => {
  const { year, month, day } = parseIsoDate(iso);
  return `${pad(day)}/${pad(month)}/${year}`;
};

/** Backend period keys: "2026" | "2026/Q1" | "2026/03" → "2026" | "Q1/2026" | "T03/2026". */
export const periodLabel = (key) => {
  const [year, part] = String(key).split("/");
  if (!part) return year;
  return part.startsWith("Q") ? `${part}/${year}` : `T${part}/${year}`;
};

/** Rows of the backend "Tổng thu, tổng chi và lợi nhuận" table → chart points (values untouched). */
export const financialSeries = (table) => {
  if (!table?.columns) return [];
  const row = (label) => table.rows?.find((r) => r.label === label)?.values ?? [];
  const revenue = row("Tổng thu");
  const expense = row("Tổng chi");
  const profit = row("Lợi nhuận");
  return table.columns.map((key, index) => ({
    key,
    label: periodLabel(key),
    revenue: Number(revenue[index] ?? 0),
    expense: Number(expense[index] ?? 0),
    profit: Number(profit[index] ?? 0),
  }));
};

export const seriesIsEmpty = (points) => points.every((p) => !p.revenue && !p.expense && !p.profit);

/** Years (newest first) that have any revenue or expense, always including the current year. */
export const yearsWithData = (yearTable, currentYear) => {
  const years = new Set([currentYear]);
  for (const point of financialSeries(yearTable)) {
    if (point.revenue || point.expense) years.add(Number(point.key));
  }
  return [...years].filter(Number.isFinite).sort((a, b) => b - a);
};
