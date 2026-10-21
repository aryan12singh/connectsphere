const test = require('node:test');
const assert = require('node:assert/strict');
const { now } = require('../../src/clock');

test('clock supplies a fresh Date at the application clock boundary', () => {
  const first = now();
  const second = now();
  assert.ok(first instanceof Date);
  assert.ok(second instanceof Date);
  assert.ok(Math.abs(Date.now() - first.getTime()) < 1_000);
  assert.notEqual(first, second);
});
