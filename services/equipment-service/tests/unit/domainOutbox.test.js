const test = require('node:test');
const assert = require('node:assert/strict');
const { project, start } = require('../../src/domainOutbox');

test('TC-CS46-01 EquipmentReleased projection preserves the persisted action identity', () => {
  const row = { id: 'release-message-1', eventType: 'EquipmentReleased', payload: { eventId: 'event-1', cancellationActionId: 'cancel-1', released: [] } };
  assert.deepEqual(project(row), { id: row.id, type: 'EquipmentReleased', aggregateType: 'Event', aggregateId: 'event-1', payload: row.payload });
});

test('Equipment release relay starts only in Prisma mode with a broker URL', () => {
  let called = false;
  assert.equal(start({ env: { DATA_MODE: 'memory', RABBITMQ_URL: 'amqp://broker' }, relay: () => { called = true; } }), null);
  assert.equal(start({ env: { DATA_MODE: 'prisma' }, relay: () => { called = true; } }), null);
  assert.equal(called, false);
});

test('Equipment release relay uses the shared outbox relay and equipment-owned database', () => {
  let received;
  const marker = { stop: async () => {}, connected: () => true };
  const result = start({ env: { DATA_MODE: 'prisma', RABBITMQ_URL: 'amqp://broker', DATABASE_URL: 'postgresql://localhost/test' }, prisma: { marker: true }, relay: options => { received = options; return marker; } });
  assert.equal(result, marker);
  assert.equal(received.source, 'equipment');
  assert.equal(received.prisma.marker, true);
  assert.equal(received.project.name, 'project');
});

test('Equipment release relay rejects malformed rows and suppresses rows with no notice', () => {
  assert.throws(() => project({ id: 'bad', eventType: 'EquipmentReserved', payload: {} }), /Invalid EquipmentReserved/);
  assert.throws(() => project({ id: 'bad', eventType: 'EquipmentReleased', payload: { eventId: 'event-1' } }), /Invalid EquipmentReleased/);
  assert.equal(project({ id: 'nr', eventType: 'TechRequestDeclaredNotRequired', payload: { eventRequestId: 'r1' } }), null);
});

test('CS-51 AC3/AC4 technical request, decision, reservation and flag rows are relayed for notices', () => {
  for (const eventType of ['TechRequestSubmitted', 'TechRequestDecided', 'EquipmentReserved', 'EquipmentUnavailable']) {
    const row = { id: `m-${eventType}`, eventType, payload: { eventRequestId: 'r1', eventId: 'e1' } };
    assert.deepEqual(project(row), { id: row.id, type: eventType, aggregateType: 'TechnicalRequest', aggregateId: 'r1', payload: row.payload });
  }
});
