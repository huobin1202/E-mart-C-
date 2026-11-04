import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/features/customers/customerSlice.js', import.meta.url), 'utf8'))
  .replace('"@reduxjs/toolkit"', JSON.stringify(import.meta.resolve('@reduxjs/toolkit')))
  .replace(/import \{\r?\n[\s\S]*?\} from "\.\.\/\.\.\/api\/customerApi";/, 'const getCustomers = () => {}; const getCustomerById = () => {}; const createCustomer = () => {}; const updateCustomer = () => {}; const toggleCustomerStatus = () => {}; const deleteCustomer = () => {};');
const { default: reducer, fetchCustomers } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const args = { page: 1, pageSize: 25, silent: true };
const loaded = () => ({ ...reducer(undefined, { type: 'init' }), items: [{ id: 1, fullName: 'Khách A' }] });

test('background refresh preserves rows and never enters blocking loading state', () => {
  let state = reducer(loaded(), fetchCustomers.pending('refresh', args));
  assert.equal(state.loading, false);
  assert.equal(state.items.length, 1);
  state = reducer(state, fetchCustomers.rejected(new Error('offline'), 'refresh', args, 'offline'));
  assert.equal(state.error, null);
  assert.equal(state.refreshError, 'offline');
  assert.equal(state.items.length, 1);
});

test('a late refresh cannot overwrite a newer search result', () => {
  let state = reducer(loaded(), fetchCustomers.pending('old', args));
  const search = { page: 1, pageSize: 25, search: 'B' };
  state = reducer(state, fetchCustomers.pending('new', search));
  assert.equal(state.loading, true);
  state = reducer(state, fetchCustomers.fulfilled({ items: [{ id: 2 }], totalItems: 1 }, 'new', search));
  state = reducer(state, fetchCustomers.fulfilled({ items: [{ id: 1 }], totalItems: 1 }, 'old', args));
  assert.deepEqual(state.items, [{ id: 2 }]);
  assert.equal(state.loading, false);
});
