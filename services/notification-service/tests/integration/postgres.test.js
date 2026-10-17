// CS-50 against a real PostgreSQL database (notification_test).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('notification');
const prisma = require('../../src/db');
const config = require('../../src/config');
const { deliver } = require('../../src/deliver');

config.retryDelayMs = 0;
let api;
const names = async (id) => ({ c1: 'Casey One' }[id] || 'a Coordinator');
const message = (id, type, payload = {}) => ({
  id, type, aggregateType: 'EventRequest', aggregateId: 'r1',
  payload: { eventRequestId: 'r1', organiserId: 'pg-o1', eventName: 'PG Summit', occurredAt: new Date().toISOString(), ...payload },
});
const as = (id, role = 'EVENT_ORGANISER') => ({ 'x-test-user-id': id, 'x-test-role': role });

before(async () => {
  await prisma.notification.deleteMany();
  await prisma.messageReceipt.deleteMany();
  api = await start(require('../../src/app'));
});
after(async () => { await api?.close(); await prisma.$disconnect(); });

test('TC-CS50-05pg ten parallel redeliveries of one message store one notice', async () => {
  const approved = message('pg-M1', 'RequestApproved', { eventId: 'pg-e1' });
  await Promise.allSettled(Array.from({ length: 10 }, () => deliver(approved, { names })));
  assert.equal(await prisma.notification.count({ where: { sourceMessageId: 'pg-M1' } }), 1);
  assert.equal((await prisma.messageReceipt.findUnique({ where: { messageId: 'pg-M1' } })).status, 'PROCESSED');
});

test('TC-CS50-01pg/03pg approval notice is listed, read state is saved in the database', async () => {
  const list = await api.http('/notifications', { headers: as('pg-o1') });
  assert.equal(list.status, 200);
  assert.equal(list.body.items[0].type, 'EVENT_APPROVED');
  assert.equal(list.body.badge, '1');
  const id = list.body.items[0].id;
  assert.equal((await api.http(`/notifications/${id}/read`, { method: 'POST', headers: as('pg-o1'), body: {} })).status, 204);
  assert.ok((await prisma.notification.findUnique({ where: { id } })).readAt);
  assert.equal((await api.http(`/notifications/${id}`, { headers: as('someone-else') })).status, 404);
});

test('TC-CS50-08pg failure after retries is stored as FAILED with 4 attempts', async () => {
  const result = await deliver(message('pg-fail', 'CoordinatorAssigned', { coordinatorId: 'c1' }), { names: async () => { throw new Error('down'); } });
  assert.equal(result.result, 'failed');
  const receipt = await prisma.messageReceipt.findUnique({ where: { messageId: 'pg-fail' } });
  assert.deepEqual([receipt.status, receipt.attempts], ['FAILED', 4]);
  const failures = await api.http('/notifications/failures', { headers: as('ts1', 'TECHNICAL_SUPPORT_STAFF') });
  assert.equal(failures.body.items[0].messageId, 'pg-fail');
});

test('TC-CS50-11pg read more than 30 days ago is hidden; 30 days is kept', async () => {
  const [notice] = (await api.http('/notifications', { headers: as('pg-o1') })).body.items;
  const day = 24 * 60 * 60 * 1000;
  await prisma.notification.update({ where: { id: notice.id }, data: { readAt: new Date(Date.now() - 30 * day + 60_000) } });
  assert.equal((await api.http('/notifications', { headers: as('pg-o1') })).body.items.length, 1);
  await prisma.notification.update({ where: { id: notice.id }, data: { readAt: new Date(Date.now() - 31 * day) } });
  assert.equal((await api.http('/notifications', { headers: as('pg-o1') })).body.items.length, 0);
});
