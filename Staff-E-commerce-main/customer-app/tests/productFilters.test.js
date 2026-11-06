import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, emptyFilters, matchesFilters, matchesKeyword } from '../src/utils/productFilters.js';
const product = { price: 20000, originalPrice: 30000, categoryId: 1, stockQuantity: 5, region: 'Nam', isBestSeller: true };
test('price range is inclusive and an empty selection keeps everything', () => {
  const filters = { ...emptyFilters(), min: '20000', max: '50000' };
  for (const price of [20000, 30000, 50000]) assert.equal(matchesFilters({ ...product, price }, filters), true);
  for (const price of [19999, 50001]) assert.equal(matchesFilters({ ...product, price }, filters), false);
  assert.equal(matchesFilters(product, emptyFilters()), true);
});
test('popup keyword and advanced filters combine on the same catalogue', () => {
  const items = [{ ...product, productName: 'Bánh Oreo' }, { ...product, price: 50000, productName: 'Bánh quy' }, { ...product, productName: 'Sữa tươi' }];
  const filters = { ...emptyFilters(), max: '25000', conditions: [{ field: 'region', operator: '==', value: 'Bắc', negate: true, logic: 'AND' }] };
  assert.deepEqual(items.filter((p) => matchesKeyword(p, 'banh') && matchesFilters(p, filters)).map((p) => p.productName), ['Bánh Oreo']);
  assert.equal(matchesKeyword({ productName: 'Đậu đỏ' }, 'dau do'), true);
});
test('comparison operators include strict boundaries and both inequality spellings', () => {
  for (const [op, expected] of [['>', false], ['<', false], ['>=', true], ['<=', true], ['==', true], ['!=', false], ['<>', false]]) assert.equal(compare(20, op, '20'), expected);
});
test('groups combine with AND, categories/regions allow multiple choices', () => {
  const filters = { ...emptyFilters(), categories: ['1', '2'], regions: ['Bắc', 'Nam'], min: '20000', max: '20000', promotion: '30', status: ['stock', 'best'] };
  assert.equal(matchesFilters(product, filters), true);
  assert.equal(matchesFilters({ ...product, region: null }, filters), false);
  assert.equal(matchesFilters({ ...product, stockQuantity: 0 }, filters), false);
});
test('AND precedes OR and NOT negates only its condition', () => {
  const conditions = [
    { field: 'price', operator: '==', value: '20000', logic: 'AND' },
    { field: 'stockQuantity', operator: '==', value: '0', logic: 'OR' },
    { field: 'region', operator: '==', value: 'Nam', logic: 'AND', negate: true },
  ];
  assert.equal(matchesFilters(product, { ...emptyFilters(), conditions }), true);
  assert.equal(matchesFilters(product, { ...emptyFilters(), conditions: conditions.slice(1) }), false);
  assert.equal(matchesFilters(product, emptyFilters()), true);
});

import { allCategoriesOff, enableAllCategories, hiddenCategoryCount, isCategoryOn, toggleCategory } from '../src/utils/productFilters.js';
test('category toggles: all on by default, off hides only that category, on again restores it', () => {
  const categories = [{ id: 1 }, { id: 2 }];
  const catalogue = [{ ...product, id: 'a', categoryId: 1 }, { ...product, id: 'b', categoryId: 2 }];
  const start = emptyFilters();
  assert.equal(categories.every((c) => isCategoryOn(start, c.id)), true);
  assert.deepEqual(catalogue.filter((p) => matchesFilters(p, start)).map((p) => p.id), ['a', 'b']);
  const oneOff = toggleCategory(start, 1);
  assert.deepEqual(catalogue.filter((p) => matchesFilters(p, oneOff)).map((p) => p.id), ['b']);
  assert.equal(hiddenCategoryCount(oneOff, categories), 1);
  const backOn = toggleCategory(oneOff, '1');
  assert.deepEqual(catalogue.filter((p) => matchesFilters(p, backOn)).map((p) => p.id), ['a', 'b']);
  // Toggled-on categories still respect the other groups.
  assert.equal(matchesFilters({ ...product, categoryId: 2, price: 90000 }, { ...oneOff, max: '50000' }), false);
});
test('all categories off is an explicit empty state; enable-all restores the default', () => {
  const categories = [{ id: 1 }, { id: 2 }];
  const allOff = toggleCategory(toggleCategory(emptyFilters(), 1), 2);
  assert.equal(allCategoriesOff(allOff, categories), true);
  assert.equal(allCategoriesOff(emptyFilters(), []), false);
  assert.deepEqual(enableAllCategories(allOff).excludedCategories, []);
  // A category added later in the backend is on unless the shopper turns it off.
  assert.equal(allCategoriesOff(allOff, [...categories, { id: 3 }]), false);
  assert.equal(isCategoryOn(allOff, 3), true);
});
