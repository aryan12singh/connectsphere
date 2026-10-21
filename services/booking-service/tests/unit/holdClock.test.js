const test = require('node:test');
const assert = require('node:assert/strict');
const { holdIsExpired, holdWarningDue, validateHoldDeadline } = require('../../src/holdClock');

test('holdClock requires an explicit boundary policy and warns only before expiry', () => {
  const hold = { createdAt: '2028-01-01T00:00:00Z', expiresAt: '2028-01-01T00:10:00Z', occupiedStartAt: '2028-01-01T00:20:00Z' };
  assert.throws(() => validateHoldDeadline(hold), /explicit boolean/);
  assert.deepEqual(validateHoldDeadline(hold, { allowExpiryAtOccupiedStart: false }), {});
  assert.throws(() => validateHoldDeadline({ ...hold, expiresAt: hold.createdAt }, { allowExpiryAtOccupiedStart: true }), /follow creation/);
  assert.equal(holdWarningDue(hold.expiresAt, hold.expiresAt, 60_000), false);
});

test('holdClock honours expiry and explicit deadline-boundary policy', () => {
  assert.equal(holdIsExpired('2028-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z'), true);
  assert.equal(holdWarningDue('2028-01-01T01:00:00.000Z', '2028-01-01T00:30:00.000Z', 30 * 60_000), true);
  assert.equal(holdWarningDue('2028-01-01T01:00:00.000Z', '2028-01-01T00:00:00.000Z', 30 * 60_000), false);
  assert.throws(() => holdWarningDue('2028-01-01T01:00:00.000Z', '2028-01-01T00:00:00.000Z', -1));
  assert.deepEqual(validateHoldDeadline({ createdAt: '2028-01-01T00:00:00.000Z', expiresAt: '2028-01-01T00:10:00.000Z', occupiedStartAt: '2028-01-01T00:10:00.000Z' }, { allowExpiryAtOccupiedStart: true }), {});
  assert.throws(() => validateHoldDeadline({ createdAt: '2028-01-01T00:00:00.000Z', expiresAt: '2028-01-01T00:10:00.000Z', occupiedStartAt: '2028-01-01T00:10:00.000Z' }, { allowExpiryAtOccupiedStart: false }));
});
