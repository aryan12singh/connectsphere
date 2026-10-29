const test = require('node:test');
const assert = require('node:assert/strict');
const { equipmentAllocations } = require('../../src/equipmentAllocations');

const venue = { id: 'venue-1', version: 3, setupMinutes: 30, turnaroundMinutes: 15 };
const booking = { id: 'booking-1', venueId: 'venue-1', version: 7, status: 'CONFIRMED', startAt: '2028-11-20T02:00:00.000Z', endAt: '2028-11-20T04:00:00.000Z', flags: ['ACCESSIBLE'] };

test('TC-CS41-13 excludes expired tentative holds from the current allocation projection', () => {
  const allocations = equipmentAllocations([
    booking,
    { ...booking, id: 'expired', status: 'TENTATIVELY_HELD', expiresAt: '2028-11-20T01:00:00.000Z' },
    { ...booking, id: 'active', status: 'TENTATIVELY_HELD', expiresAt: '2028-11-20T03:00:00.000Z' },
  ], [venue], '2028-11-20T02:30:00.000Z');
  assert.deepEqual(allocations.map(value => ({ bookingId: value.bookingId, bookingVersion: value.bookingVersion, venueVersion: value.venueVersion })), [
    { bookingId: 'booking-1', bookingVersion: 7, venueVersion: 3 },
    { bookingId: 'active', bookingVersion: 7, venueVersion: 3 },
  ]);
  assert.throws(() => equipmentAllocations([booking], [], 'bad'), /check instant/i);
  assert.throws(() => equipmentAllocations([booking], [], '2028-11-20T02:30:00.000Z'), /configuration/i);
});
