const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPROVED,
  CONFIRMED,
  getPrimaryVenue,
  getEffectiveVenues,
  excludeObsoleteBookings,
} = require('../../src/domain/venues');

test('constants are defined', () => {
  assert.equal(APPROVED, 'APPROVED');
  assert.equal(CONFIRMED, 'CONFIRMED');
});

test('getPrimaryVenue returns designated primary when provided', () => {
  const venues = [
    { id: 'v-1', name: 'First Created' },
    { id: 'v-2', name: 'Designated Primary' },
  ];
  assert.deepEqual(getPrimaryVenue(venues, 'v-2'), { id: 'v-2', name: 'Designated Primary' });
});

test('getPrimaryVenue falls back to first venue when no designation', () => {
  const venues = [{ id: 'v-1', name: 'First' }, { id: 'v-2', name: 'Second' }];
  assert.deepEqual(getPrimaryVenue(venues, null), venues[0]);
  assert.deepEqual(getPrimaryVenue(venues, undefined), venues[0]);
});

test('getPrimaryVenue returns null for empty venues', () => {
  assert.equal(getPrimaryVenue([], 'v-1'), null);
  assert.equal(getPrimaryVenue(null, 'v-1'), null);
});

test('getEffectiveVenues returns only confirmed approved bookings', () => {
  const bookings = [
    { venueId: 'v-1', venueName: 'Hall A', status: 'CONFIRMED', approved: true, startAt: '09:00', endAt: '12:00' },
    { venueId: 'v-2', venueName: 'Hall B', status: 'PENDING', approved: true, startAt: '10:00', endAt: '13:00' },
    { venueId: 'v-3', venueName: 'Hall C', status: 'CONFIRMED', approved: false, startAt: '11:00', endAt: '14:00' },
    { venueId: 'v-4', venueName: 'Hall D', status: 'REJECTED', approved: false },
  ];
  const effective = getEffectiveVenues(bookings);
  assert.equal(effective.length, 1);
  assert.deepEqual(effective[0], { id: 'v-1', name: 'Hall A', startAt: '09:00', endAt: '12:00' });
});

test('excludeObsoleteBookings filters out replaced, rejected, expired, pending', () => {
  const bookings = [
    { venueId: 'v-1', status: 'CONFIRMED', approved: true },
    { venueId: 'v-2', status: 'CONFIRMED', approved: true, replacedBy: 'v-3' },
    { venueId: 'v-3', status: 'CONFIRMED', approved: false, rejected: true },
    { venueId: 'v-4', status: 'CONFIRMED', approved: true, expired: true },
    { venueId: 'v-5', status: 'CONFIRMED', approved: true, pending: true },
    { venueId: 'v-6', status: 'CANCELLED', approved: false },
  ];
  const valid = excludeObsoleteBookings(bookings);
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0], { venueId: 'v-1', status: 'CONFIRMED', approved: true });
});

test('excludeObsoleteBookings returns empty for non-array', () => {
  assert.deepEqual(excludeObsoleteBookings(null), []);
  assert.deepEqual(excludeObsoleteBookings(undefined), []);
});
