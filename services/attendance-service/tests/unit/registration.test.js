const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRegistrationLimit,
  isRegistrationOpen,
  getOwnRegistration,
  canReadOwnRegistration,
  isEventVisible,
} = require('../../src/domain/registration');

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
