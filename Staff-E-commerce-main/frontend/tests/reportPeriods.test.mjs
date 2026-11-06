import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipRange, currentQuarter, financialSeries, isFutureQuarter, periodLabel, quarterRange, seriesIsEmpty, validateDateRange, yearsWithData } from '../src/utils/reportPeriods.js';

test('calendar quarters, including leap-year February and year end', () => {
  assert.deepEqual(quarterRange(2024, 1), { from: '2024-01-01', to: '2024-03-31' });
  assert.deepEqual(quarterRange(2026, 2), { from: '2026-04-01', to: '2026-06-30' });
  assert.deepEqual(quarterRange(2026, 3), { from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(quarterRange(2026, 4), { from: '2026-10-01', to: '2026-12-31' });
});
test('current quarter comes from the Vietnam date string, not the browser clock', () => {
  assert.deepEqual(currentQuarter('2026-03-31'), { year: 2026, quarter: 1 });
  assert.deepEqual(currentQuarter('2026-04-01'), { year: 2026, quarter: 2 });
  assert.deepEqual(currentQuarter('2026-12-31'), { year: 2026, quarter: 4 });
  assert.equal(isFutureQuarter(2026, 4, '2026-09-30'), true);
  assert.equal(isFutureQuarter(2026, 4, '2026-10-01'), false);
  assert.deepEqual(clipRange(quarterRange(2026, 4), '2026-11-05'), { from: '2026-10-01', to: '2026-11-05' });
});
test('date range validation', () => {
  assert.equal(validateDateRange('2026-05-01', '2026-05-01'), '');
  assert.match(validateDateRange('2026-05-02', '2026-05-01'), /không được lớn hơn/);
  assert.match(validateDateRange('', '2026-05-01'), /đủ ngày/);
  assert.equal(validateDateRange('2025-12-15', '2026-01-15'), '');
  assert.match(validateDateRange('2000-01-01', '2026-01-01'), /tối đa/);
});
test('chart points keep the backend values and label the periods', () => {
  const table = { columns: ['2026/Q1', '2026/Q2'], rows: [
    { label: 'Tổng thu', values: [100, 0] }, { label: 'Tổng chi', values: [40, 0] }, { label: 'Lợi nhuận', values: [60, 0] }] };
  assert.deepEqual(financialSeries(table), [
    { key: '2026/Q1', label: 'Q1/2026', revenue: 100, expense: 40, profit: 60 },
    { key: '2026/Q2', label: 'Q2/2026', revenue: 0, expense: 0, profit: 0 }]);
  assert.equal(periodLabel('2026/03'), 'T03/2026');
  assert.equal(seriesIsEmpty(financialSeries(table).slice(1)), true);
  const years = { columns: ['2023', '2024', '2025'], rows: [{ label: 'Tổng thu', values: [5, 0, 0] }, { label: 'Tổng chi', values: [0, 0, 7] }] };
  assert.deepEqual(yearsWithData(years, 2026), [2026, 2025, 2023]);
});
