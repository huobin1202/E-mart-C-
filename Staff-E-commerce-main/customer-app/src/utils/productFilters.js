// excludedCategories: ids the shopper switched OFF. Empty = every category on, so a category
// added later in the backend is shown by default instead of being hidden by accident.
export const emptyFilters = () => ({ categories: [], excludedCategories: [], min: '', max: '', promotion: '', status: [], regions: [], conditions: [] });

export const isCategoryOn = (filters, categoryId) => !(filters.excludedCategories || []).includes(String(categoryId));

export function toggleCategory(filters, categoryId) {
  const id = String(categoryId);
  const off = filters.excludedCategories || [];
  return { ...filters, excludedCategories: off.includes(id) ? off.filter((x) => x !== id) : [...off, id] };
}

export const enableAllCategories = (filters) => ({ ...filters, excludedCategories: [] });

/** Every known category switched off: the result is empty on purpose (never "no filter"). */
export const allCategoriesOff = (filters, categories) =>
  categories.length > 0 && categories.every((category) => !isCategoryOn(filters, category.id));

export const hiddenCategoryCount = (filters, categories) =>
  categories.filter((category) => !isCategoryOn(filters, category.id)).length;
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
  if (!isCategoryOn(filters, product.categoryId)) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(String(product.categoryId))) return false;
  if (filters.min !== '' && product.price < Number(filters.min)) return false;
  if (filters.max !== '' && product.price > Number(filters.max)) return false;
  if (filters.promotion !== '' && !(percent > 0 && percent >= Number(filters.promotion))) return false;
  if (filters.status.includes('stock') && !(product.stockQuantity > 0)) return false;
  if (filters.status.includes('best') && product.isBestSeller !== true) return false;
  if (filters.regions.length > 0 && !filters.regions.includes(product.region)) return false;
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
