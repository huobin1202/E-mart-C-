import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/api/apiClient.js', import.meta.url), 'utf8'))
  .replace('import { trackRequestStart, trackRequestEnd } from "../utils/requestTracker";', 'const trackRequestStart = () => {}; const trackRequestEnd = () => {};');
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const token = `header.${Buffer.from(JSON.stringify({ uid: 1, sub: 'test', session_version: 0 })).toString('base64url')}.signature`;

test('a non-expiring login remains available after a long time and reload; manual logout still clears it', () => {
  const previousWindow = global.window;
  const previousStorage = global.localStorage;
  const previousNow = Date.now;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  global.window = { localStorage: storage };
  global.localStorage = storage;
  try {
    storage.setItem('auth_token', token);
    Date.now = () => new Date('2099-01-01T00:00:00Z').getTime();
    assert.equal(api.isTokenExpired(token), false);
    assert.equal(api.getAuthToken(), token);
    assert.equal(storage.getItem('auth_token'), token);
    api.logout();
    assert.equal(api.getAuthToken(), null);
    assert.equal(storage.getItem('auth_token'), null);
  } finally {
    Date.now = previousNow;
    global.window = previousWindow;
    global.localStorage = previousStorage;
  }
});
