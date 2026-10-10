const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRequirements,
  decideRequirements,
  canReadRequirements,
  canEditRequirements,
  poolVenueAllocations,
} = require('../../src/domain/technical-request');

const base = {
  eventId: 'event-1',
  coordinatorId: 'coordinator-1',
  equipment: [{ equipmentType: 'projector', quantity: 2 }],
  supportRequired: true,
  supportDetails: 'One technician for setup',
  placementDetails: 'Room A: 1; Room B: 1',
};

test('TC-CS40-02 rejects unknown equipment and invalid quantities without accepting a partial request', () => {
  for (const equipment of [
    [{ equipmentType: 'unknown', quantity: 1 }],
    [{ equipmentType: 'projector', quantity: 0 }],
    [{ equipmentType: 'projector', quantity: -1 }],
    [{ equipmentType: 'projector', quantity: 1.5 }],
  ]) {
    const result = validateRequirements({ ...base, equipment }, ['projector']);
    assert.equal(result.valid, false);
  }
});

test('TC-CS40-05 accepts support-only requests but does not mark them ready before a decision', () => {
  const result = validateRequirements({ ...base, equipment: [], supportRequired: true }, ['projector']);
  assert.equal(result.valid, true);
  assert.equal(result.value.readiness, 'PENDING');
});

test('TC-CS40-06 records an explicit not-required state as a versioned decision prerequisite', () => {
  const result = validateRequirements({
    ...base,
    equipment: [],
    supportRequired: false,
    notRequired: true,
  }, ['projector']);
  assert.equal(result.valid, true);
  assert.equal(result.value.notRequired, true);
});

test('TC-CS40-07 supersedes approval when material requirements change', () => {
  const approved = { version: 1, status: 'APPROVED', requirements: base };
  const updated = validateRequirements({ ...base, placementDetails: 'Room A: 2' }, ['projector'], approved);
  assert.equal(updated.value.version, 2);
  assert.equal(updated.value.readiness, 'PENDING');
});

test('TC-CS40-08 and TC-CS40-09 enforce current Coordinator and Technical Support roles', () => {
  assert.equal(canEditRequirements({ id: 'coordinator-1', role: 'EVENT_COORDINATOR' }, base), true);
  assert.equal(canEditRequirements({ id: 'old-coordinator', role: 'EVENT_COORDINATOR' }, base), false);
  assert.equal(canEditRequirements({ id: 'safety-1', role: 'SAFETY_OFFICER' }, base), false);
  assert.equal(canReadRequirements({ id: 'safety-1', role: 'SAFETY_OFFICER', permittedEventIds: ['event-1'] }, base), true);
  assert.equal(canReadRequirements({ id: 'unrelated-1', role: 'EVENT_COORDINATOR' }, base), false);
});

test('TC-CS40-03 and TC-CS40-04 require Technical Support and a non-blank rejection reason', () => {
  const request = { version: 1, status: 'SUBMITTED' };
  assert.throws(() => decideRequirements(request, { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }, 'REJECTED', '  '));
  assert.throws(() => decideRequirements(request, { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }, 'APPROVED'));
  assert.equal(decideRequirements(request, { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }, 'REJECTED', 'Insufficient staff').status, 'REJECTED');
});

test('TC-CS40-10 pools equipment allocated across venues into one Event request', () => {
  assert.deepEqual(poolVenueAllocations([
    { venueId: 'room-a', equipmentType: 'projector', quantity: 1 },
    { venueId: 'room-b', equipmentType: 'projector', quantity: 1 },
    { venueId: 'room-b', equipmentType: 'microphone', quantity: 2 },
  ]), [
    { equipmentType: 'projector', quantity: 2 },
    { equipmentType: 'microphone', quantity: 2 },
  ]);
});

test('TC-CS40-11 rejects decisions against a superseded request version', () => {
  const request = { version: 2, status: 'SUBMITTED' };
  assert.throws(
    () => decideRequirements(request, { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }, 'APPROVED', '', 1),
    error => error.status === 409,
  );
});
