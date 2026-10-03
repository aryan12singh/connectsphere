const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBooking } = require('../../src/validation');

function validBooking(overrides = {}) {
  return {
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

test('CS-booking-VAL-01: submission requires venue, title, reason, interval and time zone', () => {
  const errors = validateBooking({});

  assert.deepEqual(Object.keys(errors).sort(), [
    'venueId', 'title', 'reason', 'startAt', 'endAt', 'timeZone',
  ].sort());
});

test('CS-booking-VAL-02: a blank reason is rejected with field-level guidance', () => {
  assert.deepEqual(validateBooking(validBooking({ reason: '   ' })), {
    reason: ['Reason is required'],
  });
});

test('CS-booking-VAL-02b: invalid supplied booking fields receive field-level guidance', () => {
  assert.deepEqual(validateBooking(validBooking({
    venueId: '   ',
    title: '   ',
    timeZone: '   ',
    startAt: 'not-a-date',
    endAt: 'also-not-a-date',
  })), {
    venueId: ['Venue is required'],
    title: ['Title is required'],
    startAt: ['Start time must be an ISO date-time'],
    endAt: ['End time must be an ISO date-time'],
    timeZone: ['Time zone is required'],
  });
});

test('CS-booking-VAL-03: endAt must be later than startAt', () => {
  assert.deepEqual(validateBooking(validBooking({
    startAt: '2026-11-20T09:00:00.000Z',
    endAt: '2026-11-20T01:00:00.000Z',
  })), {
    endAt: ['End time must be after start time'],
  });
});

test('CS-booking-VAL-04: CONFLICT is not a persisted service status', () => {
  assert.deepEqual(validateBooking(validBooking({ status: 'CONFLICT' })), {
    status: ['Unknown booking status'],
  });
});
