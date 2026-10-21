const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');
const readiness = require('../../src/readiness');
const actor = { id: 'coordinator-ready', role: 'EVENT_COORDINATOR' };
const eventContexts = require('../../src/eventContext');
const operations = require('../../src/operations');
const contexts = new Map();
test.mock.method(eventContexts, 'eventContext', async eventId => contexts.get(eventId) || ({ eventId, eventRequestId: eventId, requirementsRevision: 'revision-1', safetyToken: 'ready-unit', safetyGeneration: 1, safetyState: 'PREPARING' }));

test('readiness distinguishes missing, pending, declared-not-required and exact token release outcomes', async () => {
  assert.equal((await readiness.current('missing-readiness')).reason, 'TECHNICAL_REQUEST_MISSING');
  const eventRequestId = 'readiness-unit';
  const requirements = { equipment: [], supportRequired: true, supportDetails: 'Operator', placementDetails: 'Front', notRequired: false };
  const context = { eventId: eventRequestId, requirementsRevision: 'revision-1' };
  contexts.set(eventRequestId, { ...context, eventRequestId, safetyToken: 'pending', safetyGeneration: 1, safetyState: 'PREPARING' });
  await store.saveSubmission({ eventRequestId, actor, value: { version: 1, status: 'PENDING_TECH_REVIEW', requirements }, context });
  await assert.rejects(() => readiness.prepare(eventRequestId, { token: 'pending', generation: 1 }), error => error.code === 'TECHNICAL_NOT_READY');
  await assert.rejects(() => readiness.prepare(eventRequestId, { token: '', generation: 1 }), error => error.code === 'VALIDATION_FAILED');
  await store.saveSubmission({ eventRequestId, actor, value: { version: 2, status: 'NOT_REQUIRED', requirements: { ...requirements, supportRequired: false, notRequired: true } }, context });
  contexts.set(eventRequestId, { ...context, eventRequestId, safetyToken: 'ready-unit', safetyGeneration: 1, safetyState: 'PREPARING' });
  assert.equal((await readiness.prepare(eventRequestId, { token: 'ready-unit', generation: 1 })).status, 'NOT_REQUIRED');
  assert.equal((await readiness.release(eventRequestId)).released, false);
  assert.equal((await readiness.release('foreign', 'ready-unit')).released, false);
  assert.equal((await readiness.release(eventRequestId, 'ready-unit')).released, true);
  assert.equal((await readiness.release(eventRequestId, 'ready-unit')).released, false);
  assert.equal((await readiness.release(eventRequestId, 'missing')).released, false);
});

test('CS-95 planning correction makes even declared-not-required technical proof stale', async () => {
  const eventRequestId = 'corrected-readiness';
  const context = { eventId: eventRequestId, requirementsRevision: 'original-revision' };
  await store.saveSubmission({ eventRequestId, actor, context, value: { version: 1, status: 'NOT_REQUIRED', requirements: { equipment: [], supportRequired: false, supportDetails: '', placementDetails: 'Clear exits', notRequired: true } } });
  contexts.set(eventRequestId, { ...context, eventRequestId, requirementsRevision: 'corrected-revision' });
  const proof = await readiness.current(eventRequestId);
  assert.equal(proof.reason, 'TECHNICAL_REQUIREMENTS_STALE');
  assert.equal(proof.status, 'UNVERIFIED');
});

test('CS-93 approved Safety proof includes the reserved equipment and Support arrangement', async () => {
  const eventRequestId = 'snapshot-readiness';
  await store.saveSubmission({ eventRequestId, actor, context: { eventId: eventRequestId, requirementsRevision: 'revision-1' }, value: { version: 1, status: 'PENDING_TECH_REVIEW', requirements: { equipment: [{ equipmentType: 'projector', quantity: 1 }], supportRequired: true, supportDetails: 'Operator at lectern', placementDetails: 'Front', notRequired: false } } });
  await store.saveDecision({ eventRequestId, actor, version: 1, decision: 'APPROVED' });
  const request = await store.findRequest(eventRequestId);
  const reserved = await operations.reserve({ request, window: { startAt: '2035-01-01T10:00:00Z', endAt: '2035-01-01T12:00:00Z' }, actor });
  const proof = await readiness.current(eventRequestId);
  assert.equal(proof.status, 'APPROVED');
  assert.deepEqual(proof.reservations, reserved.reservations);
  assert.equal(proof.equipment[0].label, 'projector');
  assert.equal(proof.supportRequired, true);
  assert.equal(proof.supportDetails, 'Operator at lectern');
  assert.equal(proof.requirementsRevision, 'revision-1');
  assert.equal(proof.version, 1);
});
