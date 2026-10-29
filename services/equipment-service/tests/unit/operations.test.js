const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const operations = require('../../src/operations');
const inventory = require('../../src/inventory');
const actor = { id: 'operator-unit', role: 'TECHNICAL_SUPPORT_STAFF' };
const window = { startAt: '2035-02-01T10:00:00Z', endAt: '2035-02-01T12:00:00Z' };
const request = { eventRequestId: 'unit-reservation', version: 1, status: 'APPROVED', requirements: { equipment: [{ equipmentType: 'projector', quantity: 2 }] } };
beforeEach(async () => {
  for (const rows of [operations._memory.reservations, operations._memory.operations]) rows.length = 0;
  operations._memory.outbox.length = 0; operations._memory.history.length = 0;
  operations._memory.idempotency.clear();
  const item = (await inventory.inventory()).items.find(item => item.equipmentType === 'projector');
  await inventory.update('projector', { total: 5, version: item.version });
});

test('TC-CS42-08 reservation retries preserve identity and replacements exclude only their own old stock', async () => {
  const input = { request, window, actor, key: 'reserve', hash: 'first' };
  const first = await operations.reserve(input);
  assert.equal((await operations.reserve(input)).reservations[0].id, first.reservations[0].id);
  await assert.rejects(() => operations.reserve({ ...input, hash: 'changed' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  const replacement = await operations.reserve({ ...input, key: 'replace', hash: 'second', request: { ...request, version: 2, requirements: { equipment: [{ equipmentType: 'projector', quantity: 4 }] } } });
  assert.equal(replacement.reservations[0].quantity, 4);
  assert.equal(operations._memory.reservations.filter(row => row.active).length, 1);
});

test('TC-CS42-02 any short line rejects the complete request without partial reservations', async () => {
  const competitor = { ...request, eventRequestId: 'unit-competitor', requirements: { equipment: [{ equipmentType: 'projector', quantity: 5 }] } };
  await operations.reserve({ request: competitor, window, actor, key: 'competitor', hash: 'competitor' });
  const multiLine = { ...request, eventRequestId: 'unit-atomic-shortage', requirements: { equipment: [{ equipmentType: 'speaker', quantity: 1 }, { equipmentType: 'projector', quantity: 1 }] } };
  await assert.rejects(() => operations.reserve({ request: multiLine, window, actor, key: 'atomic-shortage', hash: 'short' }), error => error.code === 'EQUIPMENT_SHORTFALL' && error.lines.some(line => line.equipmentType === 'projector' && line.shortfall === 1));
  assert.deepEqual(operations._memory.reservations.filter(row => row.eventRequestId === multiLine.eventRequestId), []);
  assert.deepEqual(operations._memory.reservations.filter(row => row.eventRequestId === competitor.eventRequestId).map(row => row.quantity), [5]);
});

test('reserving an already-reserved request version with a new action key returns the existing reservation', async () => {
  const first = await operations.reserve({ request, window, actor, key: 'first-reserve', hash: 'first' });
  const repeated = await operations.reserve({ request, window, actor, key: 'repeat-reserve', hash: 'repeat' });
  assert.deepEqual(repeated.reservations.map(row => row.id), first.reservations.map(row => row.id));
  assert.equal(operations._memory.reservations.filter(row => row.active).length, 1);
});

test('invalid periods, approvals and operational commands write no commitment', async () => {
  await assert.rejects(() => operations.reserve({ request: { ...request, status: 'PENDING_TECH_REVIEW' }, window, actor }), error => error.code === 'STALE_VERSION');
  await assert.rejects(() => operations.availability({ request, window: { startAt: 'bad' } }), error => error.code === 'VALIDATION_FAILED');
  for (const patch of [{ quantity: 0 }, { quantity: 6 }, { equipmentType: 'unknown' }, { reason: ' ' }, { reason: 'x'.repeat(501) }, { endAt: window.startAt }]) {
    await assert.rejects(() => operations.createOperation({ body: { ...window, equipmentType: 'projector', quantity: 1, reason: 'Repair', ...patch }, actor }), error => error.code === 'VALIDATION_FAILED');
  }
  assert.equal(operations._memory.reservations.length, 0); assert.equal(operations._memory.operations.length, 0);
});

test('operational command retries and dated checks preserve stock and commitment boundaries', async () => {
  const input = { actor, key: 'operation', body: { ...window, type: 'projector', quantity: 4, reason: ' Repair ' } };
  const first = await operations.createOperation(input);
  assert.equal((await operations.createOperation(input)).id, first.id);
  await assert.rejects(() => operations.createOperation({ ...input, body: { ...input.body, quantity: 3 } }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  const check = await operations.availability({ request, window });
  assert.equal(check.lines[0].shortfall, 1); assert.equal(operations._memory.checks, undefined);
  await assert.rejects(() => operations.reserve({ request, window, actor }), error => error.code === 'EQUIPMENT_SHORTFALL');
  assert.equal(operations._memory.reservations.length, 0);
});

test('availability returns fresh results without persisting check history or commitments', async () => {
  const first = await operations.availability({ request, window });
  const second = await operations.availability({ request, window });
  assert.deepEqual(first.lines, second.lines);
  assert.equal(operations._memory.checks, undefined);
  assert.equal(operations._memory.reservations.length, 0);
});

test('TC-CS46-01/03/04 releases one Event once from accepted cancellation proof and keeps other Events committed', async () => {
  const first = { id: 'ev8-projector', eventRequestId: 'req-8', eventId: 'ev-8', requestVersion: 1, equipmentType: 'projector', quantity: 1, startAt: window.startAt, endAt: window.endAt, active: true, actorId: 'support', sourceVersions: {}, createdAt: new Date().toISOString() };
  const second = { ...first, id: 'ev8-mic', equipmentType: 'microphone', quantity: 2 };
  const unrelated = { ...first, id: 'ev9-projector', eventRequestId: 'req-9', eventId: 'ev-9', quantity: 2 };
  operations._memory.reservations.push(first, second, unrelated);
  operations._memory.operations.push({ id: 'maintenance-1', equipmentType: 'projector', quantity: 1, startAt: window.startAt, endAt: window.endAt, active: true });
  const proof = { eventId: 'ev-8', eventRequestId: 'req-8', cancellationActionId: 'cancel-action-8', phase: 'CANCELLING', proofType: 'ACCEPTED_INTENT', actorId: 'coord-8' };
  const result = await operations.releaseCanceledEvent({ eventId: 'ev-8', cancellationActionId: 'cancel-action-8', proof });
  assert.deepEqual(result.released.map(row => [row.equipmentType, row.quantity]), [['microphone', 2], ['projector', 1]]);
  assert.ok(operations._memory.reservations.filter(row => row.eventId === 'ev-8').every(row => row.active === false));
  assert.equal(unrelated.active, true);
  const replay = await operations.releaseCanceledEvent({ eventId: 'ev-8', cancellationActionId: 'cancel-action-8', proof });
  assert.equal(replay.replayed, true);
  assert.equal(operations._memory.outbox.filter(row => row.eventType === 'EquipmentReleased').length, 1);
  assert.equal(operations._memory.history.filter(row => row.action === 'EquipmentReleased').length, 1);
  const availability = await operations.availability({ request: { version: 1, requirements: { equipment: [{ equipmentType: 'projector', quantity: 5 }] } }, window });
  assert.equal(availability.lines[0].available, 2, 'other Event commitments and maintenance continue to consume stock');
});

test('TC-CS46-07 refuses release without an exact accepted cancellation proof', async () => {
  operations._memory.reservations.push({ eventId: 'ev-8', eventRequestId: 'req-8', active: true, equipmentType: 'projector', quantity: 1, startAt: window.startAt, endAt: window.endAt });
  await assert.rejects(() => operations.releaseCanceledEvent({ eventId: 'ev-8', cancellationActionId: 'wrong', proof: { eventId: 'ev-8', cancellationActionId: 'another', proofType: 'ACCEPTED_INTENT', phase: 'CANCELLING' } }), error => error.code === 'CANCELLATION_NOT_COMMITTED');
  assert.equal(operations._memory.reservations[0].active, true);
});
