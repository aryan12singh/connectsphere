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

test('Equipment release relay rejects malformed and unrelated outbox rows', () => {
  assert.throws(() => project({ id: 'bad', eventType: 'EquipmentReserved', payload: {} }), /Invalid EquipmentReleased/);
  assert.throws(() => project({ id: 'bad', eventType: 'EquipmentReleased', payload: { eventId: 'event-1' } }), /Invalid EquipmentReleased/);
});
