const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('equipment');
const db = require('../../src/db');
const store = require('../../src/store');
const operations = require('../../src/operations');
const readiness = require('../../src/readiness');
let api;
const coordinator = { id: 'pg-coordinator', role: 'EVENT_COORDINATOR' };
const support = { id: 'pg-support', role: 'TECHNICAL_SUPPORT_STAFF' };
const window = { startAt: '2035-01-01T10:00:00.000Z', endAt: '2035-01-01T12:00:00.000Z' };
const requirements = equipment => ({ equipment, supportRequired: false, supportDetails: '', placementDetails: 'At the lectern', notRequired: false });
async function submit(equipment, status = 'PENDING_TECH_REVIEW') {
  const eventRequestId = `pg-${randomUUID()}`;
  const saved = await store.saveSubmission({ eventRequestId, actor: coordinator, value: { version: 1, status, requirements: requirements(equipment) }, hash: 'submit', context: { eventId: eventRequestId, requirementsRevision: 'revision-1' } });
  assert.equal(saved.record.version, 1);
  if (status !== 'NOT_REQUIRED') await store.saveDecision({ eventRequestId, actor: support, decision: 'APPROVED', reason: '', version: 1, hash: 'approve' });
  return store.findRequest(eventRequestId);
}
before(async () => {
  await db.technicalReadinessFence.deleteMany();
  await db.equipmentReservation.deleteMany();
  await db.equipmentOperationalUnavailability.deleteMany();
  await db.technicalRequest.deleteMany();
  await db.outboxEvent.deleteMany();
  await db.idempotencyRecord.deleteMany();
  for (const name of ['projector', 'speaker', 'microphone', 'lighting', 'stage']) {
    await db.equipmentStock.upsert({ where: { equipmentType: name }, create: { equipmentType: name, total: 5 }, update: { total: 5 } });
  }
  api = await start(require('../../src/app'));
});
after(async () => { await api?.close(); await db.$disconnect(); });

test('equipment naming migration preserves stock while migrating the legacy catalog and request table names', async () => {
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261018090000_snake_case_equipment_schema/migration.sql'), 'utf8');
  const marker = new Error('ROLLBACK_MIGRATION_TEST');
  await assert.rejects(db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "EquipmentType" (id TEXT, name TEXT, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE equipment_stock ("equipmentType" TEXT PRIMARY KEY, total INTEGER, version INTEGER, "updatedAt" TIMESTAMPTZ)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "TechnicalRequest" (id TEXT PRIMARY KEY, "eventRequestId" TEXT)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "TechnicalRequestHistory" (id TEXT PRIMARY KEY, "requestId" TEXT)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "OutboxEvent" (id TEXT PRIMARY KEY)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "IdempotencyRecord" (id TEXT PRIMARY KEY)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE equipment_availability_checks (id TEXT PRIMARY KEY)');
    await tx.$executeRawUnsafe(`INSERT INTO "EquipmentType" VALUES ('eq_projector', 'projector', '2020-01-01T00:00:00Z', CURRENT_TIMESTAMP), ('eq_camera', 'camera', '2019-01-01T00:00:00Z', CURRENT_TIMESTAMP)`);
    await tx.$executeRawUnsafe(`INSERT INTO equipment_stock VALUES ('projector', 17, 4, CURRENT_TIMESTAMP)`);
    await tx.$executeRawUnsafe(`INSERT INTO "TechnicalRequest" VALUES ('request-1', 'event-1')`);
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const stock = await tx.$queryRawUnsafe('SELECT "equipmentType", total, version FROM equipment_stock ORDER BY "equipmentType"');
    assert.deepEqual(stock.map(row => [row.equipmentType, row.total, row.version]), [['camera', 0, 1], ['projector', 17, 4]]);
    const catalogCreatedAt = await tx.$queryRawUnsafe(`SELECT "createdAt" FROM equipment_stock WHERE "equipmentType"='projector'`);
    assert.equal(new Date(catalogCreatedAt[0].createdAt).toISOString(), '2020-01-01T00:00:00.000Z');
    assert.equal((await tx.$queryRawUnsafe("SELECT to_regclass('technical_requests') AS name"))[0].name, 'technical_requests');
    assert.equal((await tx.$queryRawUnsafe("SELECT to_regclass('technical_request_history') AS name"))[0].name, 'technical_request_history');
    assert.equal((await tx.$queryRawUnsafe("SELECT to_regclass('outbox_events') AS name"))[0].name, 'outbox_events');
    assert.equal((await tx.$queryRawUnsafe("SELECT to_regclass('idempotency_records') AS name"))[0].name, 'idempotency_records');
    assert.equal((await tx.$queryRawUnsafe("SELECT to_regclass('equipment_availability_checks') AS name"))[0].name, null);
    const request = await tx.$queryRawUnsafe('SELECT id, "eventRequestId" FROM technical_requests');
    assert.deepEqual(request, [{ id: 'request-1', eventRequestId: 'event-1' }]);
    throw marker;
  }), error => error === marker);
});

test('TC-CS42-01/08 PostgreSQL reserves every approved line and retries retain one history and outbox action', async () => {
  const request = await submit([{ equipmentType: 'projector', quantity: 2 }, { equipmentType: 'speaker', quantity: 1 }]);
  const input = { request, window, actor: support, key: randomUUID(), hash: 'two-lines', sourceVersions: { requirementsRevision: 'revision-1' } };
  const saved = await operations.reserve(input);
  assert.equal(saved.reservations.length, 2);
  assert.deepEqual(saved.reservations.map(row => row.quantity), [2, 1]);
  assert.equal((await operations.reserve(input)).replayed, true);
  await assert.rejects(() => operations.reserve({ ...input, hash: 'different' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.equal(await db.technicalRequestHistory.count({ where: { requestId: request.id, action: 'EquipmentReserved' } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { actionKey: `EquipmentReserved:${request.eventRequestId}:v1` } }), 1);
  await db.$disconnect();
  assert.equal((await readiness.current(request.eventRequestId)).status, 'APPROVED');
});

test('TC-CS42 PostgreSQL repeat reserve with a fresh action key reuses the current reservation', async () => {
  const request = await submit([{ equipmentType: 'projector', quantity: 2 }]);
  const input = { request, window, actor: support, key: randomUUID(), hash: 'first-reserve' };
  const first = await operations.reserve(input);
  const repeated = await operations.reserve({ ...input, key: randomUUID(), hash: 'repeat-reserve' });
  assert.deepEqual(repeated.reservations.map(row => row.id), first.reservations.map(row => row.id));
  assert.equal(await db.equipmentReservation.count({ where: { eventRequestId: request.eventRequestId, active: true } }), 1);
  assert.equal(await db.technicalRequestHistory.count({ where: { requestId: request.id, action: 'EquipmentReserved' } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { actionKey: `EquipmentReserved:${request.eventRequestId}:v1` } }), 1);
});

test('TC-CS41-04/05 live dated checks include reservations and operational unavailability without persisting snapshots or creating commitments', async () => {
  const request = await submit([{ equipmentType: 'projector', quantity: 3 }]);
  const operation = await operations.createOperation({ body: { equipmentType: 'projector', quantity: 1, reason: 'Repair', ...window }, actor: support });
  assert.equal(operation.version, 1);
  const count = await db.equipmentReservation.count();
  const result = await operations.availability({ request, window });
  assert.equal(result.fulfillable, false);
  assert.equal(result.lines[0].available, 2);
  assert.equal(result.lines[0].shortfall, 1);
  assert.ok(result.checkedAt);
  await operations.availability({ request, window });
  assert.equal(await db.equipmentReservation.count(), count);
});

test('TC-CS42-02/03 PostgreSQL shortages and obsolete approvals commit no reservation, history or action', async () => {
  const request = await submit([{ equipmentType: 'speaker', quantity: 1 }, { equipmentType: 'projector', quantity: 5 }]);
  const input = { request, window, actor: support, key: randomUUID(), hash: 'shortage' };
  const before = await db.technicalRequestHistory.count({ where: { requestId: request.id } });
  await assert.rejects(() => operations.reserve(input), error => error.code === 'EQUIPMENT_SHORTFALL' && error.lines.find(line => line.equipmentType === 'projector').shortfall === 3);
  assert.equal(await db.equipmentReservation.count({ where: { eventRequestId: request.eventRequestId } }), 0);
  assert.equal(await db.technicalRequestHistory.count({ where: { requestId: request.id } }), before);
  assert.equal(await db.idempotencyRecord.count({ where: { key: input.key } }), 0);
  await db.technicalRequest.update({ where: { id: request.id }, data: { version: 2 } });
  await assert.rejects(() => operations.reserve(input), error => error.code === 'STALE_VERSION');
});

test('TC-CS42-09 a failed durable outbox insert rolls back all reservation lines and remains retryable', async () => {
  const request = await submit([{ equipmentType: 'lighting', quantity: 2 }]);
  const input = { request, window, actor: support, key: randomUUID(), hash: 'rollback' };
  await db.$executeRawUnsafe(`CREATE FUNCTION equipment_test_reject_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='EquipmentReserved' THEN RAISE EXCEPTION 'isolated rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER equipment_test_reject_reservation BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION equipment_test_reject_reservation()');
  try {
    await assert.rejects(() => operations.reserve(input));
    assert.equal(await db.equipmentReservation.count({ where: { eventRequestId: request.eventRequestId } }), 0);
    assert.equal(await db.technicalRequestHistory.count({ where: { requestId: request.id, action: 'EquipmentReserved' } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER equipment_test_reject_reservation ON outbox_events');
    await db.$executeRawUnsafe('DROP FUNCTION equipment_test_reject_reservation()');
  }
  assert.equal((await operations.reserve(input)).reservations.length, 1);
});

test('TC-CS42-10 persisted readiness fences validate tokens, survive reconnect and release exactly once', async () => {
  const request = await submit([], 'NOT_REQUIRED');
  const token = randomUUID();
  await assert.rejects(() => readiness.prepare(request.eventRequestId, {}), error => error.code === 'VALIDATION_FAILED');
  assert.equal((await readiness.prepare(request.eventRequestId, { token, generation: 1 })).status, 'NOT_REQUIRED');
  await db.$disconnect();
  assert.equal((await db.technicalReadinessFence.findUnique({ where: { token } })).active, true);
  assert.equal((await readiness.release(request.eventRequestId, token)).released, true);
  assert.equal((await readiness.release(request.eventRequestId, token)).released, false);
  const internal = { 'x-internal-api-key': 'change-me-dev-internal-key' };
  assert.equal((await api.http(`/internal/events/${request.eventRequestId}/readiness/prepare`, { method: 'POST', headers: internal, body: { token, generation: 2 } })).status, 200);
  assert.equal((await api.http(`/internal/events/${request.eventRequestId}/readiness/release`, { method: 'POST', headers: internal, body: { token } })).body.released, true);
});

test('TC-CS41-10 operational retries persist exactly one command and reject changed payload reuse', async () => {
  const body = { equipmentType: 'stage', quantity: 1, reason: 'Repair fixture', startAt: '2036-01-01T10:00:00Z', endAt: '2036-01-01T12:00:00Z' };
  const key = randomUUID();
  const first = await operations.createOperation({ body, actor: support, key });
  const second = await operations.createOperation({ body, actor: support, key });
  assert.equal(second.id, first.id);
  assert.equal(await db.equipmentOperationalUnavailability.count({ where: { equipmentType: 'stage' } }), 1);
  await assert.rejects(() => operations.createOperation({ body: { ...body, quantity: 2 }, actor: support, key }), error => error.status === 409);
});

test('TC-CS42-12 current-version proof requires replacement and replacement does not count its own old stock', async () => {
  const request = await submit([{ equipmentType: 'microphone', quantity: 2 }]);
  const replacementWindow = { startAt: '2037-01-01T10:00:00Z', endAt: '2037-01-01T12:00:00Z' };
  await operations.reserve({ request, window: replacementWindow, actor: support, key: randomUUID(), hash: 'original' });
  await store.saveSubmission({ eventRequestId: request.eventRequestId, actor: coordinator, value: { version: 2, status: 'PENDING_TECH_REVIEW', requirements: requirements([{ equipmentType: 'microphone', quantity: 4 }]) } });
  await store.saveDecision({ eventRequestId: request.eventRequestId, actor: support, decision: 'APPROVED', version: 2 });
  assert.equal((await readiness.current(request.eventRequestId)).status, 'PENDING');
  const current = await store.findRequest(request.eventRequestId);
  const replaced = await operations.reserve({ request: current, window: replacementWindow, actor: support, key: randomUUID(), hash: 'replacement' });
  assert.equal(replaced.reservations[0].quantity, 4);
  assert.equal(await db.equipmentReservation.count({ where: { eventRequestId: request.eventRequestId, active: true } }), 1);
});

test('TC-CS41-09 overlapping repair invalidates proof while retaining all reservation and decision history', async () => {
  const request = await submit([{ equipmentType: 'lighting', quantity: 2 }]);
  const occupied = { startAt: '2038-01-01T10:00:00Z', endAt: '2038-01-01T12:00:00Z' };
  await operations.reserve({ request, window: occupied, actor: support, key: randomUUID(), hash: 'repair-proof' });
  const rows = await db.equipmentReservation.findMany({ where: { eventRequestId: request.eventRequestId } });
  await operations.createOperation({ body: { ...occupied, equipmentType: 'lighting', quantity: 4, reason: 'Repair' }, actor: support, key: randomUUID() });
  const proof = await readiness.current(request.eventRequestId);
  assert.equal(proof.status, 'PENDING'); assert.equal(proof.reason, 'EQUIPMENT_OPERATION_CHANGED');
  assert.deepEqual(await db.equipmentReservation.findMany({ where: { eventRequestId: request.eventRequestId } }), rows);
});

test('TC-CS42-07 PostgreSQL competing Events cannot overcommit and return a retryable conflict', async () => {
  await db.equipmentStock.update({ where: { equipmentType: 'microphone' }, data: { total: 3 } });
  const first = await submit([{ equipmentType: 'microphone', quantity: 2 }]);
  const second = await submit([{ equipmentType: 'microphone', quantity: 2 }]);
  const occupied = { startAt: '2040-01-01T10:00:00Z', endAt: '2040-01-01T12:00:00Z' };
  const results = await Promise.allSettled([first, second].map(request => operations.reserve({ request, window: occupied, actor: support, key: randomUUID(), hash: request.eventRequestId })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const rows = await db.equipmentReservation.findMany({ where: { eventRequestId: { in: [first.eventRequestId, second.eventRequestId] }, active: true } });
  assert.equal(rows.reduce((sum, row) => sum + row.quantity, 0), 2);
  await db.equipmentStock.update({ where: { equipmentType: 'microphone' }, data: { total: 5 } });
});

test('TC-CS41-10 concurrent retries of one operational command retain exactly one persisted result', async () => {
  const key = randomUUID();
  const body = { equipmentType: 'stage', quantity: 1, reason: 'Concurrent repair', startAt: '2041-01-01T10:00:00Z', endAt: '2041-01-01T12:00:00Z' };
  const results = await Promise.all([operations.createOperation({ body, actor: support, key }), operations.createOperation({ body, actor: support, key })]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await db.equipmentOperationalUnavailability.count({ where: { id: results[0].id } }), 1);
});
