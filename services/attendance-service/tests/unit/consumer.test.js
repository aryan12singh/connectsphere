const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../../src/consumer');

test('Attendance starts a dedicated domain-event consumer in Prisma mode', () => {
  let received;
  const worker = { stop: async () => {} };
  const result = start({
    env: { DATA_MODE: 'prisma', RABBITMQ_URL: 'amqp://broker' },
    startConsumer(options) { received = options; return worker; },
    connect: async () => {},
    deliver: async () => {},
  });

  assert.equal(result, worker);
  assert.equal(received.config.url, 'amqp://broker');
  assert.equal(received.config.queue, 'attendance-service.domain-events');
  assert.equal(typeof received.deliver, 'function');
});

test('Attendance does not start a broker consumer outside Prisma mode or without a broker URL', () => {
  let starts = 0;
  const deps = { startConsumer() { starts += 1; }, deliver: async () => {} };
  assert.equal(start({ env: { DATA_MODE: 'memory', RABBITMQ_URL: 'amqp://broker' }, ...deps }), null);
  assert.equal(start({ env: { DATA_MODE: 'prisma' }, ...deps }), null);
  assert.equal(starts, 0);
});
