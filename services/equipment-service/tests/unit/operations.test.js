const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const operations = require('../../src/operations');
const inventory = require('../../src/inventory');
const actor = { id: 'operator-unit', role: 'TECHNICAL_SUPPORT_STAFF' };
const window = { startAt: '2035-02-01T10:00:00Z', endAt: '2035-02-01T12:00:00Z' };
const request = { eventRequestId: 'unit-reservation', version: 1, status: 'APPROVED', requirements: { equipment: [{ equipmentType: 'projector', quantity: 2 }] } };
beforeEach(async () => {
  for (const rows of [operations._memory.reservations, operations._memory.operations]) rows.length = 0;
  operations._memory.idempotency.clear();
  const item = (await inventory.inventory()).items.find(item => item.equipmentType === 'projector');
  await inventory.update('projector', { total: 5, version: item.version });
});

test('reservation retries preserve identity and replacements exclude only their own old stock', async () => {
  const input = { request, window, actor, key: 'reserve', hash: 'first' };
  const first = await operations.reserve(input);
  assert.equal((await operations.reserve(input)).reservations[0].id, first.reservations[0].id);
  await assert.rejects(() => operations.reserve({ ...input, hash: 'changed' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  const replacement = await operations.reserve({ ...input, key: 'replace', hash: 'second', request: { ...request, version: 2, requirements: { equipment: [{ equipmentType: 'projector', quantity: 4 }] } } });
  assert.equal(replacement.reservations[0].quantity, 4);
  assert.equal(operations._memory.reservations.filter(row => row.active).length, 1);
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
