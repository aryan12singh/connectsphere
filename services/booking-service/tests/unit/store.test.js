const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const store = require('../../src/store');

const COORDINATOR = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' };
const STAFF = { id: 'venue-staff-1', role: 'VENUE_STAFF' };

function bookingInput(overrides = {}) {
  return {
    eventId: 'event-1',
    venueId: 'venue-1',
    title: 'Autumn Product Summit',
    reason: 'Customer conference',
    startAt: '2026-11-20T01:00:00.000Z',
    endAt: '2026-11-20T09:00:00.000Z',
    timeZone: 'Asia/Singapore',
    status: 'TENTATIVELY_HELD',
    ...overrides,
  };
}

test.beforeEach(() => store.reset());
test.after(() => store.reset());

test('CS-booking-INFRA-01: production configuration defaults to Prisma persistence', () => {
  const result = spawnSync(process.execPath, ['-e', "delete process.env.DATA_MODE; process.env.DATABASE_URL='postgresql://test'; process.env.NODE_ENV='production'; process.stdout.write(require('./src/config').dataMode)"], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'prisma');
});

test('CS-booking-DATA-01: creating a booking persists the request and records the actor activity', () => {
  const booking = store.createBooking(bookingInput({ eventId: null }), COORDINATOR, 'idempotency-1');

  assert.equal(store.getBooking(booking.id).requestedById, 'coordinator-1');
  assert.equal(store.getBooking(booking.id).eventId, null);
  assert.equal(store.getBooking(booking.id).status, 'TENTATIVELY_HELD');
  assert.equal(store.getBooking(booking.id).idempotencyKey, 'idempotency-1');

  const [activity] = store.listHistory('venue-1');
  assert.equal(activity.action, 'BOOKING_CREATED');
  assert.equal(activity.actorId, 'coordinator-1');
  assert.equal(activity.actorRole, 'EVENT_COORDINATOR');
  assert.equal(activity.toStatus, 'TENTATIVELY_HELD');
  assert.equal(activity.reason, 'Customer conference');
});

test('CS-booking-DATA-02: a status replacement records the new status actor, reason and transition', () => {
  const booking = store.createBooking(bookingInput(), COORDINATOR, 'idempotency-2');
  const updated = store.replaceBooking(booking, bookingInput({
    status: 'CONFIRMED',
    reason: 'Approved by venue staff',
  }), STAFF);

  assert.equal(updated.status, 'CONFIRMED');
  assert.equal(updated.statusChangedById, 'venue-staff-1');
  assert.equal(updated.statusChangedRole, 'VENUE_STAFF');
  assert.equal(updated.statusReason, 'Approved by venue staff');

  const [activity] = store.listHistory('venue-1');
  assert.equal(activity.action, 'STATUS_CHANGED');
  assert.equal(activity.fromStatus, 'TENTATIVELY_HELD');
  assert.equal(activity.toStatus, 'CONFIRMED');
  assert.equal(activity.actorId, 'venue-staff-1');
});

test('CS-booking-DATA-03: a non-status edit still records the actor without changing status metadata', () => {
  const booking = store.createBooking(bookingInput(), COORDINATOR, 'idempotency-3');
  const updated = store.replaceBooking(booking, bookingInput({
    title: 'Updated summit title',
    reason: 'Clarified event title',
  }), COORDINATOR);

  assert.equal(updated.title, 'Updated summit title');
  assert.equal(updated.status, 'TENTATIVELY_HELD');
  assert.equal(updated.statusChangedById, 'coordinator-1');
  assert.equal(updated.statusReason, 'Customer conference');
  assert.equal(store.listHistory('venue-1')[0].action, 'BOOKING_UPDATED');
});

test('CS-booking-DATA-03b: an omitted event ID preserves the existing event association on replacement', () => {
  const booking = store.createBooking(bookingInput(), COORDINATOR, 'idempotency-3b');
  const updated = store.replaceBooking(booking, bookingInput({
    eventId: null,
    reason: 'Updated event details',
  }), COORDINATOR);

  assert.equal(updated.eventId, 'event-1');
});

test('CS-booking-DATA-04: history is scoped to the requested venue', () => {
  store.createBooking(bookingInput({ venueId: 'venue-1' }), COORDINATOR, 'idempotency-4');
  store.createBooking(bookingInput({ venueId: 'venue-2' }), COORDINATOR, 'idempotency-5');

  assert.equal(store.listHistory('venue-1').length, 1);
  assert.equal(store.listHistory('venue-2').length, 1);
  assert.deepEqual(store.listHistory('missing-venue'), []);
});

test('CS-booking-DATA-05: resetting the service clears records and idempotency state', () => {
  const booking = store.createBooking(bookingInput(), COORDINATOR, 'idempotency-6');
  assert.ok(store.getBooking(booking.id));

  store.reset();

  assert.equal(store.getBooking(booking.id), null);
  assert.deepEqual(store.listBookings(), []);
  assert.deepEqual(store.listHistory('venue-1'), []);
  assert.deepEqual([...store.state.idempotency], []);
});

test('CS-booking-DATA-06: blocking venue links include current and future tentative or confirmed bookings only', () => {
  const now = new Date('2026-10-04T00:00:00.000Z');
  store.createBooking(bookingInput({
    venueId: 'venue-blocked',
    status: 'TENTATIVELY_HELD',
    startAt: '2026-10-04T01:00:00.000Z',
    endAt: '2026-10-04T02:00:00.000Z',
  }), COORDINATOR, 'blocking-current');
  store.createBooking(bookingInput({
    venueId: 'venue-blocked',
    status: 'CONFIRMED',
    startAt: '2026-12-04T01:00:00.000Z',
    endAt: '2026-12-04T02:00:00.000Z',
  }), STAFF, 'blocking-future');
  store.createBooking(bookingInput({
    venueId: 'venue-blocked',
    status: 'CANCELLED',
    startAt: '2026-12-04T01:00:00.000Z',
    endAt: '2026-12-04T02:00:00.000Z',
  }), COORDINATOR, 'non-blocking-cancelled');
  store.createBooking(bookingInput({
    venueId: 'venue-blocked',
    status: 'CONFIRMED',
    startAt: '2026-09-01T01:00:00.000Z',
    endAt: '2026-09-01T02:00:00.000Z',
  }), STAFF, 'non-blocking-ended');

  assert.equal(store.countBlockingBookings('venue-blocked', now), 2);
  assert.equal(store.countBlockingBookings('other-venue', now), 0);
});
