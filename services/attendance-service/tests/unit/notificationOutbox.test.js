const test = require('node:test');
const assert = require('node:assert/strict');
const { project, start } = require('../../src/notificationOutbox');

test('TC-CS48-01 Attendance outbox projection uses the persisted row ID as a stable message ID', () => {
  const row = {
    id: 'stable-action-1', kind: 'RegistrationCreated', aggregateId: 'event-1',
    payload: { eventId: 'event-1', eventName: 'Spring Gala', userId: 'attendee-1', registrationId: 'registration-1' },
  };
  const message = project(row);
  assert.equal(message.id, row.id);
  assert.equal(message.type, 'RegistrationCreated');
  assert.equal(message.aggregateId, 'event-1');
  assert.deepEqual(message.payload, row.payload);
});

test('Attendance outbox projection rejects unsupported event types instead of publishing malformed actions', () => {
  assert.throws(() => project({ id: 'row-1', kind: 'RegistrationWaitlisted', aggregateId: 'event-1', payload: {} }), /Invalid Attendance notification outbox row/);
});

test('TC-CS49-01 RegistrationWithdrawn is projected with its stable outbox ID', () => {
  const row = { id: 'withdrawal-action-1', kind: 'RegistrationWithdrawn', aggregateId: 'event-1', payload: { eventId: 'event-1', registrationId: 'registration-1' } };
  assert.deepEqual(project(row), { id: row.id, type: 'RegistrationWithdrawn', aggregateType: 'Event', aggregateId: 'event-1', payload: row.payload });
});

test('Attendance starts its notification relay only in Prisma mode with a configured broker', () => {
  let called = false;
  assert.equal(start({ env: { DATA_MODE: 'memory', RABBITMQ_URL: 'amqp://broker' }, relay: () => { called = true; } }), null);
  assert.equal(start({ env: { DATA_MODE: 'prisma' }, relay: () => { called = true; } }), null);
  assert.equal(called, false);
});

test('Attendance notification relay publishes from its own outbox through the shared relay', () => {
  let received;
  const result = { stop: async () => {}, connected: () => true };
  const started = start({
    env: { DATA_MODE: 'prisma', RABBITMQ_URL: 'amqp://broker', DATABASE_URL: 'postgresql://localhost/test' },
    prisma: { marker: true },
    relay: options => { received = options; return result; },
  });
  assert.equal(started, result);
  assert.equal(received.source, 'attendance');
  assert.equal(received.prisma.marker, true);
  assert.equal(received.project.name, 'project');
});
