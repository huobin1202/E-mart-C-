import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, emptyFilters, matchesFilters, matchesKeyword } from '../src/utils/productFilters.js';
const product = { price: 20000, originalPrice: 30000, categoryId: 1, stockQuantity: 5, region: 'Nam', isBestSeller: true };
test('NOT category excludes selected categories while price still applies normally', () => {
  const filters = { ...emptyFilters(), categories: ['1'], min: '50001', excludedGroups: ['categories'] };
  assert.equal(matchesFilters({ ...product, price: 60000 }, filters), false);
  assert.equal(matchesFilters({ ...product, categoryId: 2, price: 60000 }, filters), true);
  assert.equal(matchesFilters({ ...product, categoryId: 2, price: 50000 }, filters), false);
});
test('NOT price excludes the selected inclusive range and ignores an empty selection', () => {
  const filters = { ...emptyFilters(), min: '20000', max: '50000', excludedGroups: ['price'] };
  for (const price of [20000, 30000, 50000]) assert.equal(matchesFilters({ ...product, price }, filters), false);
  for (const price of [19999, 50001]) assert.equal(matchesFilters({ ...product, price }, filters), true);
  assert.equal(matchesFilters(product, { ...emptyFilters(), excludedGroups: ['categories', 'price', 'promotion', 'status', 'regions'] }), true);
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
