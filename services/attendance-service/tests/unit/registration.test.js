const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRegistrationLimit,
  isRegistrationOpen,
  getOwnRegistration,
  canReadOwnRegistration,
  isEventVisible,
  canCreateRegistration,
  placesRemaining,
} = require('../../src/domain/registration');
const { canWithdraw } = require('../../src/domain/withdrawal');

test('computeRegistrationLimit returns Coordinator-set limit', () => {
  assert.equal(computeRegistrationLimit({ registrationLimit: 200 }), 200);
  assert.equal(computeRegistrationLimit({}), undefined);
});

test('isRegistrationOpen checks window boundaries', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(isRegistrationOpen({ startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' }, now), true);
  assert.equal(isRegistrationOpen({ startAt: '2026-11-20T00:00:00Z', endAt: '2026-11-30T00:00:00Z' }, now), false);
  assert.equal(isRegistrationOpen(null, now), false);
});

test('getOwnRegistration finds registration by userId', () => {
  const regs = [
    { userId: 'u-1', eventId: 'e-1', status: 'CONFIRMED' },
    { userId: 'u-2', eventId: 'e-1', status: 'PENDING' },
  ];
  assert.deepEqual(getOwnRegistration(regs, 'u-2'), { userId: 'u-2', eventId: 'e-1', status: 'PENDING' });
  assert.equal(getOwnRegistration(regs, 'u-3'), null);
  assert.equal(getOwnRegistration(null, 'u-1'), null);
});

test('canReadOwnRegistration allows owner, denies others', () => {
  const registrations = [{ userId: 'u-1', eventId: 'e-1', status: 'CONFIRMED' }];
  assert.equal(canReadOwnRegistration({ status: 'CONFIRMED' }, registrations, 'u-1', 'u-1'), true);
  assert.equal(canReadOwnRegistration({ status: 'CONFIRMED' }, registrations, 'u-1', 'u-2'), false);
  assert.equal(canReadOwnRegistration({ status: 'DRAFT' }, registrations, 'u-1', 'u-1'), false);
  assert.equal(canReadOwnRegistration({ status: 'CONFIRMED' }, [], 'u-1', 'u-1'), false);
});

test('isEventVisible returns true for CONFIRMED and CANCELLED', () => {
  assert.equal(isEventVisible('CONFIRMED'), true);
  assert.equal(isEventVisible('CANCELLED'), true);
  assert.equal(isEventVisible('APPROVED'), false);
  assert.equal(isEventVisible('SUBMITTED'), false);
});

test('TC-CS48-01 permits registration only for an enabled confirmed event inside its window with a free place', () => {
  const event = {
    status: 'CONFIRMED', registrationEnabled: true, registrationLimit: 2,
    registrationWindow: { startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' },
  };
  assert.deepEqual(canCreateRegistration(event, 1, new Date('2026-11-05T12:00:00Z')), { allowed: true });
});

test('TC-CS48-04 rejects registration when the event is disabled, ineligible, outside the window, or has no limit', () => {
  const event = {
    status: 'CONFIRMED', registrationEnabled: true, registrationLimit: 2,
    registrationWindow: { startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' },
  };
  assert.equal(canCreateRegistration({ ...event, registrationEnabled: false }, 0, new Date('2026-11-05T00:00:00Z')).reason, 'REGISTRATION_DISABLED');
  assert.equal(canCreateRegistration({ ...event, status: 'CANCELLED' }, 0, new Date('2026-11-05T00:00:00Z')).reason, 'EVENT_CANCELLED');
  assert.equal(canCreateRegistration(event, 0, new Date('2026-10-31T23:59:59Z')).reason, 'REGISTRATION_NOT_OPEN');
  assert.equal(canCreateRegistration({ ...event, registrationLimit: null }, 0, new Date('2026-11-05T00:00:00Z')).reason, 'REGISTRATION_LIMIT_UNSET');
});

test('TC-CS48-05 rejects a full or over-cap event without negative places remaining', () => {
  const event = { status: 'CONFIRMED', registrationEnabled: true, registrationLimit: 1,
    registrationWindow: { startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' } };
  const now = new Date('2026-11-05T00:00:00Z');
  assert.equal(canCreateRegistration(event, 1, now).reason, 'EVENT_FULL');
  assert.equal(placesRemaining(event, 3), 0);
  assert.equal(placesRemaining({ ...event, registrationLimit: null }, 0), null);
});

test('TC-CS48-08 accepts the inclusive opening and closing instants', () => {
  const event = { status: 'CONFIRMED', registrationEnabled: true, registrationLimit: 1,
    registrationWindow: { startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' } };
  assert.equal(canCreateRegistration(event, 0, new Date(event.registrationWindow.startAt)).allowed, true);
  assert.equal(canCreateRegistration(event, 0, new Date(event.registrationWindow.endAt)).allowed, true);
});

test('TC-CS49-07 allows withdrawal at the inclusive cutoff and rejects it after', () => {
  const event = { status: 'CONFIRMED', withdrawalEnabled: true, withdrawalCutoffAt: '2026-11-08T15:59:59.000Z' };
  const registration = { status: 'CONFIRMED' };
  assert.deepEqual(canWithdraw(event, registration, new Date('2026-11-08T15:59:58.000Z')), { allowed: true });
  assert.deepEqual(canWithdraw(event, registration, new Date('2026-11-08T15:59:59.000Z')), { allowed: true });
  assert.deepEqual(canWithdraw(event, registration, new Date('2026-11-08T16:00:00.000Z')), { allowed: false, reason: 'WITHDRAWAL_CLOSED' });
});

test('CS-49 withdrawal is denied when disabled, cancelled, or registration is not confirmed', () => {
  const event = { status: 'CONFIRMED', withdrawalEnabled: true, withdrawalCutoffAt: '2026-11-08T15:59:59.000Z' };
  const now = new Date('2026-11-01T00:00:00.000Z');
  assert.equal(canWithdraw({ ...event, withdrawalEnabled: false }, { status: 'CONFIRMED' }, now).reason, 'WITHDRAWAL_DISABLED');
  assert.equal(canWithdraw({ ...event, status: 'CANCELLED' }, { status: 'CONFIRMED' }, now).reason, 'EVENT_NOT_ACTIVE');
  assert.equal(canWithdraw(event, { status: 'WITHDRAWN' }, now).reason, 'REGISTRATION_NOT_ACTIVE');
});
