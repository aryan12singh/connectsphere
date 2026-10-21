const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIRMED,
  isEventVisible,
  filterAttendeeFields,
  filterOrganiserFields,
} = require('../../src/domain/attendance');

test('CONFIRMED constant is defined', () => {
  assert.equal(CONFIRMED, 'CONFIRMED');
});

test('isEventVisible returns true only for CONFIRMED status', () => {
  assert.equal(isEventVisible('CONFIRMED'), true);
  assert.equal(isEventVisible('APPROVED'), false);
  assert.equal(isEventVisible('SUBMITTED'), false);
  assert.equal(isEventVisible('DRAFT'), false);
  assert.equal(isEventVisible('CANCELLED'), false);
  assert.equal(isEventVisible(null), false);
});

test('filterAttendeeFields removes private fields', () => {
  const event = {
    id: 'event-1',
    title: 'Spring Gala',
    description: 'Annual event',
    internalNotes: 'secret',
    planningData: { budget: 5000 },
    equipmentPlanning: { projector: 2 },
    safetyReviews: [{ round: 1, status: 'APPROVED' }],
    safetyNotes: 'all clear',
    historicalArrangements: [{ venue: 'old' }],
    otherUserRegistrations: [{ userId: 'user-2' }],
    venueBookings: [{ venueId: 'v-1' }],
    registrationWindow: { startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-10T00:00:00Z' },
    registrationLimit: 100,
  };
  const filtered = filterAttendeeFields(event);
  assert.equal(filtered.id, 'event-1');
  assert.equal(filtered.title, 'Spring Gala');
  assert.equal(filtered.description, 'Annual event');
  assert.equal(filtered.registrationLimit, 100);
  assert.equal(filtered.internalNotes, undefined);
  assert.equal(filtered.planningData, undefined);
  assert.equal(filtered.equipmentPlanning, undefined);
  assert.equal(filtered.safetyReviews, undefined);
  assert.equal(filtered.safetyNotes, undefined);
  assert.equal(filtered.historicalArrangements, undefined);
  assert.equal(filtered.otherUserRegistrations, undefined);
  assert.equal(filtered.venueBookings, undefined);
});

test('filterOrganiserFields keeps all fields', () => {
  const event = { id: 'event-1', title: 'Spring Gala', internalNotes: 'secret' };
  const filtered = filterOrganiserFields(event);
  assert.equal(filtered.id, 'event-1');
  assert.equal(filtered.title, 'Spring Gala');
  assert.equal(filtered.internalNotes, 'secret');
});


