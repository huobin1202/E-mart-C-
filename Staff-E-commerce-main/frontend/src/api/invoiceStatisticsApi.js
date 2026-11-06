import { BASE_URL, getAuthToken } from './apiClient';

// `signal` (optional) lets the caller abort a request that a newer filter selection has replaced.
export async function invoiceStatistics(filters, format = 'json', { signal } = {}) {
  const params = new URLSearchParams(Object.entries({ ...filters, format }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const response = await fetch(`${BASE_URL}/reports/invoice-statistics?${params}`, {
    headers: { Authorization: `Bearer ${getAuthToken() || ''}` },
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || Object.values(error.errors || {}).flat().join(' ') || 'Không thể tải báo cáo hóa đơn.');
  }
  return format === 'json' ? response.json() : response.blob();
}

export function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
