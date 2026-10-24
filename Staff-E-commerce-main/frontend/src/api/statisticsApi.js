import { request } from './apiClient';

export async function getOverviewStats() {
  return request("/statistics/overview");
}

export async function getRevenueByPeriod(days = 7) {
  return request(`/statistics/revenue?days=${days}`);
}

export async function getBestSellers(limit = 10, days = 7) {
  return request(`/statistics/bestsellers?limit=${limit}&days=${days}`);
}

export async function getLowStockProducts(threshold = 10) {
  return request(`/statistics/lowstock?threshold=${threshold}`);
}

export async function getOrderStats(days = 7) {
  return request(`/statistics/orders?days=${days}`);
}
