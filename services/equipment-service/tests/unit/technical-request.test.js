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
  equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'B1' }],
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

test('TC-CS40-16 records an explicit not-required state as a versioned decision prerequisite', () => {
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
  assert.throws(() => decideRequirements(request, { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }, 'REJECTED', 'x'.repeat(501)), /500 characters/);
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

test('TC-CS40-14 and TC-CS40-15 enforce stock caps, text limits, and no-requirements rules', () => {
  const valid = validateRequirements({ ...base, equipment: [] }, ['projector']);
  assert.equal(valid.valid, true);
  for (const input of [null, {}, { ...base, equipment: 'projector' }, { ...base, eventId: ' ' }, { ...base, coordinatorId: '' }]) {
    assert.equal(validateRequirements(input, ['projector']).valid, false);
  }
  const capped = validateRequirements({ ...base, equipment: [{ equipmentType: 'projector', quantity: 3 }] }, [{ name: 'projector', total: 2 }]);
  assert.match(capped.errors['equipment.0.quantity'][0], /physical units/);
  assert.ok(validateRequirements({ ...base, supportDetails: 'x'.repeat(1001) }, ['projector']).errors.supportDetails);
  assert.ok(validateRequirements({ ...base, placementDetails: 'x'.repeat(501) }, ['projector']).errors.placementDetails);
  assert.ok(validateRequirements({ ...base, equipment: [], supportRequired: false, notRequired: false }, ['projector']).errors.requirements);
  assert.ok(validateRequirements({ ...base, notRequired: true }, ['projector']).errors.notRequired);
});

test('CS-40 decisions, permissions, and venue pooling reject invalid transitions and identities', () => {
  const pending = { version: 2, status: 'PENDING_TECH_REVIEW' };
  const support = { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' };
  assert.throws(() => decideRequirements(pending, support, 'UNKNOWN'), error => error.status === 422);
  assert.throws(() => decideRequirements({ ...pending, status: 'APPROVED' }, support, 'APPROVED'), error => error.status === 409);
  assert.equal(decideRequirements(pending, support, 'REJECTED', '  reason  ', 2).decisionReason, 'reason');
  assert.equal(canReadRequirements(null, base), false);
  assert.equal(canReadRequirements({ role: 'SAFETY_OFFICER' }, base), false);
  assert.equal(canReadRequirements({ role: 'TECHNICAL_SUPPORT_STAFF' }, base), true);
  assert.throws(() => poolVenueAllocations(null), TypeError);
  for (const item of [{ venueId: '', equipmentType: 'projector', quantity: 1 }, { venueId: 'a', equipmentType: '', quantity: 1 }, { venueId: 'a', equipmentType: 'projector', quantity: 0 }]) {
    assert.throws(() => poolVenueAllocations([item]), TypeError);
  }
});


test('venue id is required for equipment rows', () => {
  const result = validateRequirements({
    ...base,
    equipment: [{ equipmentType: 'projector', quantity: 2, venueId: '' }],
  }, ['projector']);
  assert.equal(result.valid, false);
  assert.ok(result.errors['equipment.0.venueId']);
});

test('equipment rows normalize venue id', () => {
  const result = validateRequirements({
    ...base,
    equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'B1' }],
  }, ['projector']);
  assert.equal(result.valid, true);
  assert.equal(result.value.requirements.equipment[0].venueId, 'B1');
});

test('equipment-only submissions without venue id are rejected', () => {
  const result = validateRequirements({
    ...base,
    equipment: [{ equipmentType: 'projector', quantity: 2 }],
  }, ['projector']);
  assert.equal(result.valid, false);
  assert.ok(result.errors['equipment.0.venueId']);
});
