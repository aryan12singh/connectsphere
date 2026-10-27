const test = require('node:test');
const assert = require('node:assert/strict');
const { isOutboxUnhealthy } = require('../../src/outboxHealth');

test('Attendance outbox is unhealthy when its backlog is large or its oldest action is stale', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  assert.equal(isOutboxUnhealthy({ count: 0, oldestCreatedAt: null, now }), false);
  assert.equal(isOutboxUnhealthy({ count: 100, oldestCreatedAt: now, now }), true);
  assert.equal(isOutboxUnhealthy({ count: 1, oldestCreatedAt: new Date(now.getTime() - 60_001), now }), true);
  assert.equal(isOutboxUnhealthy({ count: 1, oldestCreatedAt: new Date(now.getTime() - 59_999), now }), false);
});

test('Attendance backlog monitor queries only pending actions and can be stopped', async () => {
  const calls = [];
  const logs = [];
  const prisma = { attendanceOutbox: {
    count: async options => { calls.push(['count', options]); return 100; },
    findFirst: async options => { calls.push(['findFirst', options]); return { createdAt: new Date('2026-10-24T11:00:00Z') }; },
  } };
  const monitor = require('../../src/outboxHealth').start({ prisma, intervalMs: 5, now: () => new Date('2026-10-24T12:00:00Z'), log: (...args) => logs.push(args) });
  await new Promise(resolve => setTimeout(resolve, 15));
  await monitor.stop();
  assert.ok(calls.some(([method, options]) => method === 'count' && options.where.deliveredAt === null));
  assert.ok(logs.length >= 1);
});
