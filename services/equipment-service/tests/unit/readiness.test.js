const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');
const readiness = require('../../src/readiness');
const actor = { id: 'coordinator-ready', role: 'EVENT_COORDINATOR' };

test('readiness distinguishes missing, pending, declared-not-required and exact token release outcomes', async () => {
  assert.equal((await readiness.current('missing-readiness')).reason, 'TECHNICAL_REQUEST_MISSING');
  const eventRequestId = 'readiness-unit';
  const requirements = { equipment: [], supportRequired: true, supportDetails: 'Operator', placementDetails: 'Front', notRequired: false };
  await store.saveSubmission({ eventRequestId, actor, value: { version: 1, status: 'PENDING_TECH_REVIEW', requirements } });
  await assert.rejects(() => readiness.prepare(eventRequestId, { token: 'pending', generation: 1 }), error => error.code === 'TECHNICAL_NOT_READY');
  await assert.rejects(() => readiness.prepare(eventRequestId, { token: '', generation: 1 }), error => error.code === 'VALIDATION_FAILED');
  await store.saveSubmission({ eventRequestId, actor, value: { version: 2, status: 'NOT_REQUIRED', requirements: { ...requirements, supportRequired: false, notRequired: true } } });
  assert.equal((await readiness.prepare(eventRequestId, { token: 'ready-unit', generation: 1 })).status, 'NOT_REQUIRED');
  assert.equal((await readiness.release(eventRequestId)).released, false);
  assert.equal((await readiness.release('foreign', 'ready-unit')).released, false);
  assert.equal((await readiness.release(eventRequestId, 'ready-unit')).released, true);
  assert.equal((await readiness.release(eventRequestId, 'ready-unit')).released, false);
  assert.equal((await readiness.release(eventRequestId, 'missing')).released, false);
});
