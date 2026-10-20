const test = require('node:test');
const assert = require('node:assert/strict');
const workflows = require('../../src/workflows');

const context = { startAt: '2028-11-20T00:00:00.000Z', endAt: '2028-11-20T10:00:00.000Z', timeZone: 'Asia/Singapore', expectedAttendance: 10, minimumCapacity: 8, preferredLayout: 'THEATRE', venueType: 'PHYSICAL', venueRequirements: '', accessibilityNeeds: ['WHEELCHAIR_ACCESS'], accessibilityDetails: '' };
const venue = { id: 'venue-1', name: 'Hall', isActive: true, venueType: 'PHYSICAL', capacity: 12, setupMinutes: 0, turnaroundMinutes: 0, supportedLayouts: ['THEATRE'], facilities: ['MIC'], accessibilityTags: ['WHEELCHAIR_ACCESS'], timeZone: 'Asia/Singapore', operatingHours: ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].map(weekday => ({ weekday, isClosed: false, opensAt: '00:00', closesAt: '23:59' })) };
const input = { id: 'booking-1', venueId: 'venue-1', status: 'TENTATIVELY_HELD', startAt: '2028-11-20T02:00:00.000Z', endAt: '2028-11-20T03:00:00.000Z', expectedAttendance: 10, layout: 'THEATRE', facilities: ['MIC'], accessibilityNeeds: ['NONE'], required: true };

test('workflow requirement policy rejects stale, expired and unplannable operations', () => {
  assert.equal(workflows.effective({ status: 'CANCELLED' }, new Date()), false);
  assert.equal(workflows.effective({ status: 'TENTATIVELY_HELD' }, new Date()), false);
  assert.throws(() => workflows.activeHold({ status: 'TENTATIVELY_HELD', expiresAt: '2020-01-01T00:00:00Z' }, new Date()), error => error.code === 'HOLD_EXPIRED');
  for (const version of [undefined, 0, 1.5]) assert.throws(() => workflows.version({ version: 2 }, version), error => error.code === 'VALIDATION_ERROR');
  assert.doesNotThrow(() => workflows.version({ version: 2 }, 2));
  for (const value of [{ status: 'DRAFT' }, { status: 'ARRANGEMENT_PENDING', safetyState: 'PREPARING' }, { status: 'ARRANGEMENT_PENDING', safetyState: 'APPROVED' }]) assert.throws(() => workflows.planning(value), error => error.code === 'EVENT_NOT_PLANNING');
  assert.doesNotThrow(() => workflows.planning({ status: 'ARRANGEMENT_PENDING', safetyState: 'REWORK' }));
  assert.throws(() => workflows.needs({ ...input, layout: '' }, context), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => workflows.checkedNeeds({ ...input, endAt: '2028-11-20T11:00:00Z' }, context, venue), error => error.code === 'OUTSIDE_EVENT');
  const virtual = workflows.needs({ ...input, layout: undefined, facilities: undefined, required: undefined }, { ...context, venueType: 'VIRTUAL', preferredLayout: undefined });
  assert.equal(virtual.layout, 'VIRTUAL');
  assert.equal(virtual.required, true);
  assert.deepEqual(virtual.facilities, []);
  assert.ok(workflows.gaps({ ...input, requirements: { venueType: 'VIRTUAL' } }, venue).includes('VENUE_TYPE'));
});

test('workflows guards effective commitments, requirement gaps, deadlines and optimistic versions', () => {
  assert.equal(workflows.effective({ status: 'TENTATIVELY_HELD', expiresAt: '2028-11-20T01:00:00.000Z' }, new Date('2028-11-20T02:00:00.000Z')), false);
  assert.equal(workflows.effective({ status: 'CONFIRMED' }, new Date()), true);
  assert.deepEqual(workflows.windowFor({ ...input, status: 'BLOCKED' }, venue), { startAt: input.startAt, endAt: input.endAt });
  assert.equal(workflows.venueLock('v'), 'booking:venue:v');
  assert.equal(workflows.eventLock('e'), 'booking:event:e');
  assert.equal(workflows.needs(input, context).accessibilityNeeds.includes('WHEELCHAIR_ACCESS'), true);
  assert.throws(() => workflows.needs({ ...input, expectedAttendance: 0 }, context), error => error.code === 'VALIDATION_ERROR');
  assert.deepEqual(workflows.gaps(workflows.needs(input, context), venue), []);
  const unsuitable = { ...venue, isActive: false, capacity: 2, supportedLayouts: [], facilities: [], accessibilityTags: [], maintenancePending: true };
  assert.throws(() => workflows.checkedNeeds(input, context, unsuitable), error => error.code === 'VENUE_UNSUITABLE');
  assert.throws(() => workflows.version({ version: 2 }, 1), error => error.code === 'STALE_BOOKING');
  assert.throws(() => workflows.activeHold({ status: 'CONFIRMED' }, new Date()), error => error.code === 'ALREADY_DECIDED');
});
