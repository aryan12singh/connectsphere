const test = require('node:test');
const assert = require('node:assert/strict');
const { availabilityRange, filterAvailability } = require('../../src/availability');

test('CS-34 TC-CS34-05: availability requires a positive ISO date-time range', () => {
  assert.deepEqual(availabilityRange({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T09:00:00Z' }), {
    endAt: ['End time must be after start time'],
  });
});

test('CS-34 TC-CS34-03: availability returns only intervals overlapping the requested range', () => {
  const values = filterAvailability([
    { id: 'before', startAt: '2026-12-22T08:00:00Z', endAt: '2026-12-22T09:00:00Z' },
    { id: 'overlap', startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T10:30:00Z' },
    { id: 'adjacent', startAt: '2026-12-22T11:00:00Z', endAt: '2026-12-22T12:00:00Z' },
  ], { startAt: '2026-12-22T09:00:00Z', endAt: '2026-12-22T11:00:00Z' });

  assert.deepEqual(values.map(value => value.id), ['overlap']);
});
