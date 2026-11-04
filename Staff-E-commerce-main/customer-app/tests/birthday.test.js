import { test } from "node:test";
import assert from "node:assert/strict";
import { birthdayToIso, formatBirthday } from "../src/utils/birthday.js";

const today = new Date(2026, 10, 4, 12);
test('birthdays use DD/MM/YYYY and are sent to API without timezone shifts', () => {
  assert.equal(birthdayToIso('09/03/2001', today), '2001-03-09');
  assert.equal(birthdayToIso(' 29/02/2000 ', today), '2000-02-29');
  assert.equal(formatBirthday(new Date(2001, 2, 9)), '09/03/2001');
  assert.equal(birthdayToIso(formatBirthday(new Date(1995, 11, 31)), today), '1995-12-31');
});
test('rejects impossible dates, non-leap days and the old ISO input format', () => {
  for (const value of ['31/04/2000', '29/02/2001', '29/02/1900', '00/01/2000', '01/13/2000', '01/01/0000', '2000-02-29', '1/2/2000', 'abc']) {
    assert.equal(birthdayToIso(value, today), null, value);
  }
});
test('optional birthday stays empty; today is allowed and future dates are rejected', () => {
  assert.equal(birthdayToIso('', today), null);
  assert.equal(birthdayToIso('   ', today), null);
  assert.equal(birthdayToIso('04/11/2026', today), '2026-11-04');
  assert.equal(birthdayToIso('05/11/2026', today), null);
  assert.equal(birthdayToIso('01/01/2030', today), null);
});
