const test = require('node:test');
const assert = require('node:assert/strict');
const { statusForCreate, canCreateStatus, coordinatorCanCancel, canReplace } = require('../../src/policy');

const REQUIRED_PERSISTED_STATUSES = [
  'AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED',
  'UNAVAILABLE', 'REJECTED', 'CANCELLED',
];

function tentativeBooking(overrides = {}) {
  return {
    requestedById: 'coordinator-1',
    status: 'TENTATIVELY_HELD',
    ...overrides,
  };
}

test('CS-booking-POL-01: coordinator POST status is preserved and accepted only for allowed statuses', () => {
  for (const requestedStatus of REQUIRED_PERSISTED_STATUSES) {
    assert.equal(
      statusForCreate({ role: 'EVENT_COORDINATOR' }, requestedStatus),
      requestedStatus,
      `creation must not normalize ${requestedStatus}`,
    );
    assert.equal(
      canCreateStatus({ role: 'EVENT_COORDINATOR' }, requestedStatus),
      ['TENTATIVELY_HELD', 'CANCELLED'].includes(requestedStatus),
      `coordinator status policy for ${requestedStatus}`,
    );
  }
  assert.equal(statusForCreate({ role: 'EVENT_COORDINATOR' }), 'TENTATIVELY_HELD');
});

test('CS-booking-POL-02: venue staff can create every persisted booking status', () => {
  for (const status of REQUIRED_PERSISTED_STATUSES) {
    assert.equal(
      statusForCreate({ role: 'VENUE_STAFF' }, status),
      status,
      `venue staff should be able to create ${status}`,
    );
  }
  assert.equal(statusForCreate({ role: 'VENUE_STAFF' }), 'TENTATIVELY_HELD');
});

test('CS-booking-POL-03: technical support staff can create a non-tentative status', () => {
  assert.equal(
    statusForCreate({ role: 'TECHNICAL_SUPPORT_STAFF' }, 'BLOCKED'),
    'BLOCKED',
  );
});

test('CS-booking-POL-04: a coordinator may cancel their own TENTATIVELY_HELD booking', () => {
  const booking = tentativeBooking();
  const actor = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' };

  assert.equal(coordinatorCanCancel(booking, actor, 'CANCELLED'), true);
  assert.deepEqual(canReplace(booking, actor, 'CANCELLED'), { allowed: true });
  assert.deepEqual(canReplace(booking, actor, 'TENTATIVELY_HELD'), { allowed: true });
  assert.deepEqual(canReplace({ ...booking, status: 'CANCELLED' }, actor, 'TENTATIVELY_HELD'), { allowed: true });
  assert.deepEqual(canReplace({ ...booking, status: 'CANCELLED' }, actor, 'CANCELLED'), { allowed: true });
});

test('CS-booking-POL-05: a coordinator cannot change another actor’s booking', () => {
  const booking = tentativeBooking();
  const actor = { id: 'coordinator-2', role: 'EVENT_COORDINATOR' };

  assert.equal(coordinatorCanCancel(booking, actor, 'CANCELLED'), false);
  assert.deepEqual(canReplace(booking, actor, 'CANCELLED'), {
    allowed: false,
    message: 'Coordinators may only edit their own tentative or cancelled bookings to tentative or cancelled',
  });
});

test('CS-booking-POL-06: a coordinator cannot edit a booking to CONFIRMED', () => {
  const booking = tentativeBooking();
  const actor = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' };

  assert.equal(coordinatorCanCancel(booking, actor, 'CONFIRMED'), false);
  assert.deepEqual(canReplace(booking, actor, 'CONFIRMED'), {
    allowed: false,
    message: 'Coordinators may only edit their own tentative or cancelled bookings to tentative or cancelled',
  });
});

test('CS-booking-POL-06b: a confirmed booking cannot be cancelled through the coordinator policy', () => {
  assert.equal(
    coordinatorCanCancel(tentativeBooking({ status: 'CONFIRMED' }), { id: 'coordinator-1' }, 'CANCELLED'),
    false,
  );
});

test('CS-booking-POL-07: venue staff can replace a booking with every persisted status', () => {
  const booking = tentativeBooking({ status: 'CONFIRMED' });
  const actor = { id: 'venue-staff-1', role: 'VENUE_STAFF' };

  for (const status of REQUIRED_PERSISTED_STATUSES) {
    assert.deepEqual(canReplace(booking, actor, status), { allowed: true }, status);
  }
});
