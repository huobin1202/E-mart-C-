import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the real request function with only the browser auth dependency replaced.
const source = (await readFile(new URL('../src/api/invoiceStatisticsApi.js', import.meta.url), 'utf8'))
  .replace("import { BASE_URL, getAuthToken } from './apiClient';", "const BASE_URL = 'http://test/api'; const getAuthToken = () => 'test';");
const { invoiceStatistics } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('clear filters never sends undefined/null/empty optional values', async () => {
  const original = global.fetch;
  try {
    let url;
    global.fetch = async value => { url = new URL(value); return Response.json({ tables: [] }); };
    await invoiceStatistics({ from: '2026-01-01', to: '2026-11-04', categoryId: undefined, productSearch: '', snapshotId: null, productSort: 'name' });
    assert.equal(url.searchParams.has('categoryId'), false);
    assert.equal(url.searchParams.has('productSearch'), false);
    assert.equal(url.searchParams.has('snapshotId'), false);
    assert.equal(url.searchParams.get('productSort'), 'name');
    assert.equal(url.searchParams.get('format'), 'json');
  } finally { global.fetch = original; }
});
test('exports carry the applied product filters and snapshot', async () => {
  const original = global.fetch;
  try {
    let url;
    global.fetch = async value => { url = new URL(value); return new Response('excel'); };
    const blob = await invoiceStatistics({ productSearch: 'Bàn chải', categoryId: 4, productSort: 'price_desc', snapshotId: 'same-snapshot' }, 'xlsx');
    assert.equal(await blob.text(), 'excel');
    assert.equal(url.searchParams.get('productSearch'), 'Bàn chải');
    assert.equal(url.searchParams.get('categoryId'), '4');
    assert.equal(url.searchParams.get('productSort'), 'price_desc');
    assert.equal(url.searchParams.get('snapshotId'), 'same-snapshot');
  } finally { global.fetch = original; }
});
