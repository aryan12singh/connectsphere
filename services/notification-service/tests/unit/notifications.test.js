// CS-50 unit tests (memory mode). Test IDs follow the PO's sprint test sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/store');
const { deliver } = require('../../src/deliver');
const { noticesFor, badgeLabel } = require('../../src/templates');
const config = require('../../src/config');

config.retryDelayMs = 0; // no waiting between retries in tests
const names = async (id) => ({ c1: 'Casey One', c2: 'Charlie Two' }[id] || 'a Coordinator');
const message = (type, payload, id = `m-${type}`) => ({
  id, type, aggregateType: 'EventRequest', aggregateId: 'r1',
  payload: { eventRequestId: 'r1', organiserId: 'o1', eventName: 'Tech Summit', occurredAt: '2027-01-11T02:00:00.000Z', ...payload },
});
const inbox = async (user) => (await store.listFor(user)).items;

test.beforeEach(() => store.reset());

test('TC-CS50-01 approval gives the Organiser exactly one EVENT_APPROVED notice linking to the event', async () => {
  await deliver(message('RequestApproved', { eventId: 'e1', oldStatus: 'SUBMITTED', newStatus: 'APPROVED' }), { names });
  const items = await inbox('o1');
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'EVENT_APPROVED');
  assert.equal(items[0].link, '/events/e1');
  assert.match(items[0].text.toLowerCase(), /planning/);
});

test('TC-CS50-02 reassignment notifies the old and new Coordinator and the Organiser (naming the new one)', async () => {
  await deliver(message('CoordinatorReassigned', { fromCoordinatorId: 'c1', coordinatorId: 'c2' }), { names });
  assert.equal((await inbox('c1')).at(-1).type, 'REASSIGNED_AWAY');
  assert.equal((await inbox('c1')).at(-1).link, null, 'no link the old Coordinator can no longer open');
  assert.equal((await inbox('c2')).at(-1).type, 'ASSIGNED_TO_YOU');
  const organiser = (await inbox('o1')).at(-1);
  assert.equal(organiser.type, 'COORDINATOR_CHANGED');
  assert.match(organiser.text, /Charlie Two/);
});

test('TC-CS50-02b first assignment notifies the Coordinator and the Organiser', async () => {
  await deliver(message('CoordinatorAssigned', { coordinatorId: 'c1' }), { names });
  assert.equal((await inbox('c1'))[0].type, 'ASSIGNED_TO_YOU');
  assert.match((await inbox('o1'))[0].text, /Casey One/);
});

test('TC-CS50-04u a notice is invisible to everyone except its recipient', async () => {
  await deliver(message('RequestApproved', { eventId: 'e1' }), { names });
  const [notice] = await inbox('o1');
  assert.deepEqual(await inbox('o2'), []);
  assert.equal(await store.getOwn(notice.id, 'o2'), null);
  assert.equal(await store.markRead(notice.id, 'o2'), false);
  assert.equal((await store.getOwn(notice.id, 'o1')).readAt, null, 'not marked read by someone else');
});

test('TC-CS50-05 replaying the same message creates no second notice', async () => {
  const approved = message('RequestApproved', { eventId: 'e1' }, 'M1');
  assert.equal((await deliver(approved, { names })).result, 'processed');
  assert.equal((await deliver(approved, { names })).result, 'duplicate');
  assert.equal((await inbox('o1')).filter((n) => n.type === 'EVENT_APPROVED').length, 1);
});

test('TC-CS50-05b two separate actions on the same event each notify (dedup is per message, not per event)', async () => {
  await deliver(message('RequestReturned', {}, 'round-1'), { names });
  await deliver(message('RequestReturned', {}, 'round-2'), { names });
  assert.equal((await inbox('o1')).length, 2);
});

test('TC-CS50-07 badge shows the exact count up to 99, then 99+', () => {
  assert.equal(badgeLabel(0), '');
  assert.equal(badgeLabel(98), '98');
  assert.equal(badgeLabel(99), '99');
  assert.equal(badgeLabel(100), '99+');
});

test('TC-CS50-08 a lookup failure is retried 3 times, then the message is Failed (no notice, no false success)', async () => {
  let calls = 0;
  const broken = async () => { calls += 1; throw new Error('user-service down'); };
  const result = await deliver(message('CoordinatorAssigned', { coordinatorId: 'c1' }, 'M-fail'), { names: broken });
  assert.equal(result.result, 'failed');
  assert.equal(calls, 4, 'first try + 3 retries');
  assert.deepEqual(await inbox('o1'), []);
  const [failed] = await store.listFailed();
  assert.equal(failed.messageId, 'M-fail');
  assert.equal(failed.attempts, 4);
  assert.equal((await deliver(message('CoordinatorAssigned', { coordinatorId: 'c1' }, 'M-fail'), { names })).result, 'duplicate', 'a Failed message is not re-run automatically');
});

test('TC-CS50-09 a retry that succeeds delivers once', async () => {
  let calls = 0;
  const flaky = async (id) => { calls += 1; if (calls < 3) throw new Error('timeout'); return names(id); };
  assert.equal((await deliver(message('CoordinatorAssigned', { coordinatorId: 'c1' }, 'M-flaky'), { names: flaky })).result, 'processed');
  assert.equal((await inbox('o1')).length, 1);
});

test('TC-CS50-10 every notice has the standard fields and no internal data', async () => {
  const [notice] = await noticesFor(message('RequestRejected', { oldStatus: 'SUBMITTED', newStatus: 'REJECTED', decisionNote: 'internal' }), names);
  for (const key of ['eventName', 'requestId', 'oldStatus', 'newStatus', 'timestamp']) assert.ok(key in notice.data, key);
  assert.doesNotMatch(JSON.stringify(notice), /internal/);
});

test('TC-CS50-11 read notices stay 30 days after reading; older ones are hidden; unread always shown', async () => {
  await deliver(message('RequestApproved', { eventId: 'e1' }), { names });
  const [notice] = await inbox('o1');
  const day = 24 * 60 * 60 * 1000;
  const stored = store.state.notifications.find((n) => n.id === notice.id);
  const now = new Date();
  stored.readAt = new Date(now - 30 * day);
  assert.equal((await store.listFor('o1', { now })).items.length, 1, 'read exactly 30 days ago: kept');
  stored.readAt = new Date(now - 31 * day);
  assert.equal((await store.listFor('o1', { now })).items.length, 0, 'read 31 days ago: hidden');
});

test('TC-CS50-12 unknown message types are recorded and ignored; malformed messages are rejected', async () => {
  assert.equal((await deliver(message('SomethingElse', {}), { names })).result, 'ignored');
  await assert.rejects(() => deliver({ id: 'x' }), /Invalid message/);
});
