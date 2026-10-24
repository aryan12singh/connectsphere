const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');

test('TC-CS40-18 stores immutable technical request snapshots for each version', async () => {
  const eventRequestId = `store-history-${Date.now()}`;
  const actor = { id: 'coordinator-history', role: 'EVENT_COORDINATOR' };
  const requirements = quantity => ({ equipment: [{ equipmentType: 'projector', quantity, venueId: 'venue-history' }], supportRequired: true, supportDetails: 'Operator at lectern', placementDetails: `Position ${quantity}`, notRequired: false });
  await store.saveSubmission({ eventRequestId, actor, context: { eventId: 'event-history' }, value: { version: 1, status: 'PENDING_TECH_REVIEW', requirements: requirements(2) }, hash: 'v1' });
  await store.saveSubmission({ eventRequestId, actor, context: { eventId: 'event-history' }, value: { version: 2, status: 'PENDING_TECH_REVIEW', requirements: requirements(3) }, hash: 'v2' });

  const history = await store.listHistory(eventRequestId);
  assert.deepEqual(history.map(({ version, action, snapshot }) => ({ version, action, quantity: snapshot.equipment[0].quantity, placement: snapshot.placementDetails })), [
    { version: 2, action: 'TechRequestSubmitted', quantity: 3, placement: 'Position 3' },
    { version: 1, action: 'TechRequestSubmitted', quantity: 2, placement: 'Position 2' },
  ]);
  assert.equal((await store.findRequest(eventRequestId)).requirements.equipment[0].quantity, 3);
});

test('memory store exposes stock-enriched catalog, request views, history actions, and idempotency replay', async () => {
  const types = await store.listEquipmentTypes();
  assert.ok(types.find(item => item.name === 'projector').total >= 0);
  assert.deepEqual(Object.keys(types[0]).sort(), ['createdAt', 'id', 'name', 'total', 'updatedAt', 'version']);
  assert.equal(typeof types[0].createdAt, 'string');
  assert.equal(typeof types[0].updatedAt, 'string');
  assert.equal(types.find(item => item.name === 'projector').id, 'eq_projector');
  const eventRequestId = `store-unit-${Date.now()}`;
  const value = { version: 1, status: 'PENDING_TECH_REVIEW', requirements: { equipment: [], supportRequired: true, supportDetails: 'setup', placementDetails: 'front', notRequired: false } };
  const saved = await store.saveSubmission({ eventRequestId, actor: { id: 'coordinator-unit', role: 'EVENT_COORDINATOR' }, value, key: 'unit-submit', hash: 'same' });
  assert.equal(saved.result.status, 'PENDING_TECH_REVIEW');
  assert.equal(saved.result.decisionReason, null);
  assert.deepEqual((await store.findRequest(eventRequestId)).requirements, value.requirements);
  assert.equal((await store.listRequests()).some(request => request.eventRequestId === eventRequestId), true);
  assert.equal((await store.findIdempotency('coordinator-unit', 'unit-submit')).requestHash, 'same');
  assert.equal(await store.findIdempotency('coordinator-unit', ''), null);
  assert.equal(store.requestHash({ a: 1 }), '{"a":1}');
  assert.equal((await store.saveSubmission({ eventRequestId, actor: { id: 'coordinator-unit' }, value, key: null, hash: '' })).conflict, true);
});

test('memory store versions no-requirements declarations and prevents missing, stale, or duplicate decisions', async () => {
  const eventRequestId = `store-decision-${Date.now()}`;
  const actor = { id: 'coordinator-unit', role: 'EVENT_COORDINATOR' };
  const value = { version: 1, status: 'NOT_REQUIRED', requirements: { equipment: [], supportRequired: false, supportDetails: '', placementDetails: 'none', notRequired: true } };
  const declared = await store.saveSubmission({ eventRequestId, actor, value, hash: '' });
  assert.equal(declared.result.decidedById, actor.id);
  assert.ok(declared.result.decidedAt);
  assert.equal((await store.saveDecision({ eventRequestId: 'missing', actor, decision: 'APPROVED', version: 1 })).conflict, true);
  assert.equal((await store.saveDecision({ eventRequestId, actor, decision: 'APPROVED', version: 9 })).conflict, true);
  const pendingId = `${eventRequestId}-pending`;
  await store.saveSubmission({ eventRequestId: pendingId, actor, value: { ...value, status: 'PENDING_TECH_REVIEW', requirements: { ...value.requirements, notRequired: false, supportRequired: true, supportDetails: 'assist' } }, hash: '' });
  const approved = await store.saveDecision({ eventRequestId: pendingId, actor: { id: 'support-unit', role: 'TECHNICAL_SUPPORT_STAFF' }, decision: 'APPROVED', reason: '', version: 1, key: 'approve', hash: 'approved' });
  assert.equal(approved.result.status, 'APPROVED');
  assert.equal(approved.result.decisionReason, null);
  assert.equal((await store.saveDecision({ eventRequestId: pendingId, actor, decision: 'REJECTED', reason: 'changed', version: 1 })).conflict, true);
});

test('Prisma store creates and updates versioned requests atomically and maps conflicts', async t => {
  const config = require('../../src/config');
  const storePath = require.resolve('../../src/store');
  const dbPath = require.resolve('../../src/db');
  const inventoryPath = require.resolve('../../src/inventory');
  const savedMode = config.dataMode;
  const savedStore = require.cache[storePath];
  const savedDb = require.cache[dbPath];
  const savedInventory = require.cache[inventoryPath];
  const requests = new Map();
  const stocks = new Map();
  const idempotency = new Map();
  let transactionError = null;
  let decisionUpdateCount = 1;
  let freshSnapshot = false;
  const tx = {
    equipmentStock: {
      async upsert({ where, create }) { if (!stocks.has(where.equipmentType)) { const now = new Date(); stocks.set(where.equipmentType, { ...create, total: create.total ?? 0, version: 1, createdAt: now, updatedAt: now }); } },
      async findMany() { return [...stocks.values()]; },
    },
    technicalRequest: {
      async findUnique({ where }) { return requests.get(where.eventRequestId) || [...requests.values()].find(item => item.id === where.id) || null; },
      async findMany() { return [...requests.values()]; },
      async create({ data }) { const record = { id: `db-${data.eventRequestId}`, ...data }; requests.set(data.eventRequestId, record); return record; },
      async update({ where, data }) { const record = [...requests.values()].find(item => item.id === where.id); Object.assign(record, data); return record; },
      async updateMany({ where, data }) {
        const record = [...requests.values()].find(item => item.id === where.id && item.version === where.version && item.status === where.status);
        if (!record || decisionUpdateCount !== 1) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
    },
    technicalRequestHistory: { async create() {} },
    technicalReadinessFence: { async findMany() { return []; } },
    outboxEvent: { async create() {} },
    idempotencyRecord: {
      async findUnique({ where }) { return idempotency.get(`${where.actorId_key.actorId}:${where.actorId_key.key}`) || null; },
      async create({ data }) { idempotency.set(`${data.actorId}:${data.key}`, data); },
    },
    async $queryRaw() {},
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    ...tx,
    async $transaction(run, options) { freshSnapshot = options?.isolationLevel === 'ReadCommitted'; if (transactionError) { const error = transactionError; transactionError = null; throw error; } return run(tx); },
  } };
  stocks.set('camera', { equipmentType: 'camera', total: 3, version: 7, createdAt: new Date('2020-01-01T00:00:00.000Z'), updatedAt: new Date('2026-10-18T00:00:00.000Z') });
  config.dataMode = 'prisma';
  delete require.cache[inventoryPath];
  delete require.cache[storePath];
  const prismaStore = require('../../src/store');
  t.after(() => {
    config.dataMode = savedMode;
    if (savedStore) require.cache[storePath] = savedStore; else delete require.cache[storePath];
    if (savedDb) require.cache[dbPath] = savedDb; else delete require.cache[dbPath];
    if (savedInventory) require.cache[inventoryPath] = savedInventory; else delete require.cache[inventoryPath];
  });
  const eventRequestId = `store-prisma-${Date.now()}`;
  const catalog = await prismaStore.listEquipmentTypes();
  assert.equal(catalog.find(item => item.name === 'camera').total, 3);
  assert.equal(catalog.find(item => item.name === 'camera').version, 7);
  assert.equal(catalog.find(item => item.name === 'camera').id, 'eq_camera');
  assert.deepEqual(Object.keys(catalog[0]).sort(), ['createdAt', 'id', 'name', 'total', 'updatedAt', 'version']);
  const actor = { id: 'coord-prisma', role: 'EVENT_COORDINATOR' };
  const value = { version: 1, status: 'PENDING_TECH_REVIEW', requirements: { equipment: [], supportRequired: true, supportDetails: 'assist', placementDetails: 'front', notRequired: false } };
  assert.equal((await prismaStore.saveSubmission({ eventRequestId, actor, value, hash: 'h' })).result.version, 1);
  assert.equal(freshSnapshot, true);
  assert.equal((await prismaStore.findRequest(eventRequestId)).version, 1);
  assert.equal((await prismaStore.listRequests()).length, 1);
  assert.equal((await prismaStore.findIdempotency(actor.id, 'missing')), null);
  const updated = await prismaStore.saveSubmission({ eventRequestId, actor, value: { ...value, version: 2 }, key: 'update', hash: 'u' });
  assert.equal(updated.result.version, 2);
  assert.equal((await prismaStore.saveSubmission({ eventRequestId, actor, value, hash: 'stale' })).conflict, true);
  assert.equal((await prismaStore.saveSubmission({ eventRequestId: `${eventRequestId}-bad`, actor, value: { ...value, version: 2 }, hash: '' })).conflict, true);
  transactionError = Object.assign(new Error('duplicate'), { code: 'P2002' });
  assert.equal((await prismaStore.saveSubmission({ eventRequestId: `${eventRequestId}-duplicate`, actor, value, hash: '' })).conflict, true);
  transactionError = Object.assign(new Error('serialization'), { code: 'P2034' });
  assert.equal((await prismaStore.saveSubmission({ eventRequestId: `${eventRequestId}-retry`, actor, value, hash: '' })).conflict, true);
  transactionError = new Error('database offline');
  await assert.rejects(prismaStore.saveSubmission({ eventRequestId: `${eventRequestId}-offline`, actor, value, hash: '' }), /database offline/);
  const approvedValue = { ...value, version: 1 };
  const decisionId = `${eventRequestId}-decision`;
  await prismaStore.saveSubmission({ eventRequestId: decisionId, actor, value: approvedValue, hash: '' });
  decisionUpdateCount = 0;
  assert.equal((await prismaStore.saveDecision({ eventRequestId: decisionId, actor, decision: 'APPROVED', version: 1 })).conflict, true);
  decisionUpdateCount = 1;
  const approval = await prismaStore.saveDecision({ eventRequestId: decisionId, actor, decision: 'APPROVED', version: 1, hash: '' });
  assert.equal(approval.result.status, 'APPROVED');
  assert.equal(approval.result.decisionReason, null);
  assert.equal((await prismaStore.saveDecision({ eventRequestId: decisionId, actor, decision: 'REJECTED', reason: 'later', version: 1 })).conflict, true);
});
