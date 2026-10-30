const test = require('node:test');
const assert = require('node:assert/strict');
const { equipmentPeriod } = require('../../src/domain/equipment-period');

test('equipmentPeriod pools supplied occupied windows without adding a second equipment buffer', () => {
  assert.deepEqual(equipmentPeriod([
    { bookingId: 'booking-a', occupiedStartAt: '2026-10-18T09:30:00Z', occupiedEndAt: '2026-10-18T12:45:00Z' },
    { bookingId: 'booking-b', occupiedStartAt: '2026-10-18T10:15:00Z', occupiedEndAt: '2026-10-18T12:00:00Z' },
  ]), { startAt: '2026-10-18T09:30:00.000Z', endAt: '2026-10-18T12:45:00.000Z' });
});

test('equipment period rejects empty, unidentified, malformed and non-positive booking windows', () => {
  assert.throws(() => equipmentPeriod([]), RangeError);
  assert.throws(() => equipmentPeriod([{ occupiedStartAt: '2026-10-18T09:30:00Z', occupiedEndAt: '2026-10-18T10:00:00Z' }]), TypeError);
  assert.throws(() => equipmentPeriod([{ bookingId: 'bad', occupiedStartAt: 'bad', occupiedEndAt: '2026-10-18T10:00:00Z' }]), RangeError);
  assert.throws(() => equipmentPeriod([{ bookingId: 'bad', occupiedStartAt: '2026-10-18T10:00:00Z', occupiedEndAt: '2026-10-18T10:00:00Z' }]), RangeError);
});
