const test = require('node:test');
const assert = require('node:assert/strict');
const { instant } = require('../../src/time');

test('time rejects impossible ISO timestamps', () => {
  assert.equal(instant('2028-02-29T00:00:00.000Z', 'at'), Date.parse('2028-02-29T00:00:00.000Z'));
  assert.throws(() => instant('2028-02-30T00:00:00.000Z', 'at'), /valid ISO date-time/);
  assert.throws(() => instant('not-a-date', 'at'), /ISO date-time/);
});
