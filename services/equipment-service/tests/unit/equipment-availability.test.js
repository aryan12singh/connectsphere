const test = require('node:test');
const assert = require('node:assert/strict');
const { availabilityLine, peakCommitment } = require('../../src/domain/equipment-availability');

test('TC-CS41-03/04/09 and TC-CS42-01 account for overlapping reservations, operational unavailability, and half-open intervals', () => {
  const commitments = [
    { kind: 'RESERVATION', quantity: 2, startAt: '2026-10-18T10:00:00Z', endAt: '2026-10-18T12:00:00Z' },
    { kind: 'OPERATIONAL_UNAVAILABLE', quantity: 2, startAt: '2026-10-18T11:00:00Z', endAt: '2026-10-18T13:00:00Z' },
    { kind: 'RESERVATION', quantity: 5, startAt: '2026-10-18T13:00:00Z', endAt: '2026-10-18T14:00:00Z' },
  ];
  assert.equal(peakCommitment(commitments, { start: Date.parse('2026-10-18T10:00:00Z'), end: Date.parse('2026-10-18T13:00:00Z') }), 4);
  assert.deepEqual(availabilityLine(5, 3, commitments, '2026-10-18T10:00:00Z', '2026-10-18T13:00:00Z'), { requested: 3, available: 1, shortfall: 2 });
  assert.deepEqual(availabilityLine(5, 2, commitments, '2026-10-18T14:00:00Z', '2026-10-18T15:00:00Z'), { requested: 2, available: 5, shortfall: 0 });
});

test('TC-CS41-02 availability boundaries report exact, shortage and zero stock without negative values', () => {
  const start = '2026-10-18T10:00:00Z';
  const end = '2026-10-18T11:00:00Z';
  assert.deepEqual(availabilityLine(5, 5, [], start, end), { requested: 5, available: 5, shortfall: 0 });
  assert.deepEqual(availabilityLine(4, 5, [], start, end), { requested: 5, available: 4, shortfall: 1 });
  assert.deepEqual(availabilityLine(0, 5, [], start, end), { requested: 5, available: 0, shortfall: 5 });
});

test('TC-CS41-09 operational flags add to active reservations without deleting the reserved commitment', () => {
  const reservation = { kind: 'RESERVATION', quantity: 2, startAt: '2026-10-18T10:00:00Z', endAt: '2026-10-18T12:00:00Z' };
  const unavailable = { kind: 'OPERATIONAL_UNAVAILABLE', quantity: 1, startAt: '2026-10-18T11:00:00Z', endAt: '2026-10-18T13:00:00Z' };
  const commitments = [reservation, unavailable];
  assert.deepEqual(availabilityLine(5, 3, commitments, '2026-10-18T11:00:00Z', '2026-10-18T12:00:00Z'), { requested: 3, available: 2, shortfall: 1 });
  assert.equal(commitments.includes(reservation), true);
  assert.equal(reservation.quantity, 2);
});

test('availability rejects invalid stock, quantities, commitment quantities and intervals', () => {
  assert.throws(() => availabilityLine(-1, 1, [], '2026-10-18T10:00:00Z', '2026-10-18T11:00:00Z'), RangeError);
  assert.throws(() => availabilityLine(5, 0, [], '2026-10-18T10:00:00Z', '2026-10-18T11:00:00Z'), RangeError);
  assert.throws(() => availabilityLine(5, 1, {}, '2026-10-18T10:00:00Z', '2026-10-18T11:00:00Z'), RangeError);
  assert.throws(() => availabilityLine(5, 1, [], 'invalid', '2026-10-18T11:00:00Z'), RangeError);
  assert.throws(() => peakCommitment([{ quantity: 0, startAt: '2026-10-18T10:00:00Z', endAt: '2026-10-18T11:00:00Z' }], { start: 0, end: 1 }), RangeError);
});
