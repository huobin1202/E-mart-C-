export const emptyFilters = () => ({ categories: [], min: '', max: '', promotion: '', status: [], regions: [], conditions: [], excludedGroups: [] });
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
export function compare(left, operator, right) {
  const numeric = typeof left === 'number';
  const a = numeric ? left : normalize(left);
  const b = numeric ? Number(right) : normalize(right);
  if (left == null || (numeric && !Number.isFinite(b))) return false;
  switch (operator) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '!=': case '<>': return a !== b;
    default: return a === b;
  }
}
export function matchesFilters(product, filters) {
  const percent = Number(product.discountPercent) || (product.originalPrice > 0 ? Math.max(0, (product.originalPrice - product.price) / product.originalPrice * 100) : 0);
  const excluded = filters.excludedGroups || [];
  const accepts = (key, active, match) => !active || (excluded.includes(key) ? !match : match);
  if (!accepts('categories', filters.categories.length > 0, filters.categories.includes(String(product.categoryId)))) return false;
  const withinPrice = (filters.min === '' || product.price >= Number(filters.min)) && (filters.max === '' || product.price <= Number(filters.max));
  if (!accepts('price', filters.min !== '' || filters.max !== '', withinPrice)) return false;
  if (!accepts('promotion', filters.promotion !== '', percent > 0 && percent >= Number(filters.promotion))) return false;
  const statusMatches = (!filters.status.includes('stock') || product.stockQuantity > 0) && (!filters.status.includes('best') || product.isBestSeller === true);
  if (!accepts('status', filters.status.length > 0, statusMatches)) return false;
  if (!accepts('regions', filters.regions.length > 0, filters.regions.includes(product.region))) return false;
  // AND binds before OR; NOT applies to its own condition.
  let group = true;
  let result = false;
  filters.conditions.forEach((condition, index) => {
    const match = compare(product[condition.field], condition.operator, condition.value);
    if (index > 0 && condition.logic === 'OR') { result ||= group; group = true; }
    group = group && (condition.negate ? !match : match);
  });
  return result || group;
}

export function matchesKeyword(product, keyword) {
  return normalize((product.productName || '') + ' ' + (product.categoryName || '')).includes(normalize(keyword));
}
