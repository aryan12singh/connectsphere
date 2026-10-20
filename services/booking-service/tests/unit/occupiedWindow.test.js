const test = require('node:test');
const assert = require('node:assert/strict');
const { occupiedWindow, occupiedWindowsOverlap } = require('../../src/occupiedWindow');
const booking = { startAt: '2028-11-20T02:00:00.000Z', endAt: '2028-11-20T04:00:00.000Z' };

test('occupiedWindow rejects reversed windows and non-integral or missing buffers', () => {
  assert.throws(() => occupiedWindow({ ...booking, endAt: booking.startAt }, { setupMinutes: 0, turnaroundMinutes: 0 }), /after startAt/);
  assert.throws(() => occupiedWindow(booking, { setupMinutes: -1, turnaroundMinutes: 0 }), /non-negative whole/);
  assert.throws(() => occupiedWindow(booking), /non-negative whole/);
  assert.throws(() => occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: 0.5 }), /non-negative whole/);
});

test('occupiedWindow includes venue buffers and applies touching policy explicitly', () => {
  assert.deepEqual(occupiedWindow(booking, { setupMinutes: 30, turnaroundMinutes: 15 }), { startAt: '2028-11-20T01:30:00.000Z', endAt: '2028-11-20T04:15:00.000Z' });
  const first = { startAt: '2028-01-01T00:00:00.000Z', endAt: '2028-01-01T01:00:00.000Z' };
  const second = { startAt: '2028-01-01T01:00:00.000Z', endAt: '2028-01-01T02:00:00.000Z' };
  assert.equal(occupiedWindowsOverlap(first, second, { allowTouching: true }), false);
  assert.equal(occupiedWindowsOverlap(first, second, { allowTouching: false }), true);
  assert.throws(() => occupiedWindowsOverlap(first, second, {}));
});
