// CS-30: a Coordinator asks the Lead to reassign; only the Lead decides.
// A small fake database stands in for Prisma, so this runs with the other unit tests.
const test = require('node:test');
const assert = require('node:assert/strict');

const state = { requests: [], transfers: [], activity: [], outbox: [] };
const fakeTx = {
  $queryRaw: async () => [],
  eventRequest: {
    findUnique: async ({ where }) => state.requests.find(r => r.id === where.id) || null,
    findMany: async ({ where }) => state.requests.filter(r => where.id.in.includes(r.id)),
  },
  coordinatorTransferRequest: {
    findUnique: async ({ where }) => state.transfers.find(t => t.id === where.id) || null,
    findFirst: async ({ where }) => state.transfers.find(t => t.eventRequestId === where.eventRequestId && t.status === where.status) || null,
    findMany: async ({ where }) => state.transfers.filter(t => (!where.status || t.status === where.status) && (!where.eventRequestId || t.eventRequestId === where.eventRequestId)),
    create: async ({ data }) => { const row = { status: 'PENDING', decidedById: null, decidedAt: null, decisionReason: null, newCoordinatorId: null, createdAt: new Date(), ...data }; state.transfers.push(row); return row; },
    update: async ({ where, data }) => Object.assign(state.transfers.find(t => t.id === where.id), data),
  },
  activityLog: { create: async ({ data }) => { state.activity.push(data); } },
  outbox: { create: async ({ data }) => { state.outbox.push(data); } },
};
const fakePrisma = { ...fakeTx, $transaction: async fn => fn(fakeTx) };
// Put the fake in place of ./db before the module under test loads it.
const dbPath = require.resolve('../../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePrisma };
const transfers = require('../../src/coordinatorTransfer');

const actor = (id, role, permissions) => ({ id, role, roles: [role], permissions });
const coord = actor('c1', 'EVENT_COORDINATOR', ['event_requests.review']);
const coord2 = actor('c2', 'EVENT_COORDINATOR', ['event_requests.review']);
const lead = actor('l1', 'EVENT_COORDINATOR_LEAD', ['assignments.view']);
const owner = actor('o1', 'EVENT_ORGANISER', ['event_requests.create']);

function reset(over = {}) {
  state.requests = [{ id: 'r1', organiserId: 'o1', currentCoordinatorId: 'c1', status: 'SUBMITTED', version: 3, event: null, ...over }];
  state.transfers = []; state.activity = []; state.outbox = [];
}
const ask = (who = coord, body = {}) => transfers.request(who, 'r1', { transferActionId: 'a1', reason: 'On leave next week', ...body });

test('the assigned Coordinator asks; the row is pending, logged and announced once', async () => {
  reset();
  const out = await ask();
  assert.equal(out.status, 201);
  assert.deepEqual([out.body.status, out.body.requestedById, out.body.reason], ['PENDING', 'c1', 'On leave next week']);
  assert.deepEqual(state.activity.map(a => a.action), ['TRANSFER_REQUESTED']);
  assert.deepEqual(state.outbox.map(o => o.eventType), ['CoordinatorTransferRequested']);
  assert.equal(state.requests[0].currentCoordinatorId, 'c1'); // nothing is reassigned here
});

test('an exact retry returns the same row; the same id with other details is refused', async () => {
  reset();
  await ask();
  const again = await ask();
  assert.equal(again.status, 200);
  assert.equal(state.transfers.length, 1);
  assert.equal(state.activity.length, 1);
  await assert.rejects(() => ask(coord, { reason: 'Different' }), e => e.status === 409 && e.code === 'IDEMPOTENCY_CONFLICT');
});

test('only one open request; blank or long reasons and missing ids are refused', async () => {
  reset();
  await ask();
  await assert.rejects(() => ask(coord, { transferActionId: 'a2' }), e => e.status === 409 && e.code === 'TRANSFER_PENDING');
  reset();
  for (const reason of ['  ', '', 'x'.repeat(501), undefined]) await assert.rejects(() => ask(coord, { reason }), e => e.status === 422);
  await assert.rejects(() => transfers.request(coord, 'r1', { reason: 'ok' }), e => e.status === 422);
  await assert.rejects(() => transfers.request(coord, 'r1', null), e => e.status === 400);
  assert.equal(state.transfers.length, 0);
});

test('nobody except the current Coordinator can ask', async () => {
  reset();
  for (const who of [coord2, lead, owner]) await assert.rejects(() => ask(who), e => e.status === 403);
  reset({ organiserId: 'c1' }); // a Coordinator never acts on their own request
  await assert.rejects(() => ask(), e => e.status === 403);
  assert.equal(state.transfers.length, 0);
});

test('closed requests and stale versions are refused', async () => {
  for (const over of [{ status: 'REJECTED' }, { status: 'DRAFT' }, { status: 'APPROVED', event: { status: 'CANCELLING' } }, { status: 'APPROVED', event: { status: 'COMPLETED' } }])
    { reset(over); await assert.rejects(() => ask(), e => e.status === 409 && e.code === 'INVALID_TRANSITION'); }
  reset();
  await assert.rejects(() => ask(coord, { version: 2 }), e => e.status === 409 && e.code === 'STALE_VERSION');
  reset({ status: 'APPROVED', event: { status: 'CONFIRMED' } }); // approved and being arranged is open
  assert.equal((await ask()).status, 201);
});

test('the requester can withdraw; others cannot; a repeat is harmless', async () => {
  reset(); await ask();
  await assert.rejects(() => transfers.withdraw(coord2, 'r1', 'a1'), e => e.status === 403);
  const out = await transfers.withdraw(coord, 'r1', 'a1');
  assert.equal(out.status, 'WITHDRAWN');
  assert.equal((await transfers.withdraw(coord, 'r1', 'a1')).status, 'WITHDRAWN');
  assert.equal(state.activity.filter(a => a.action === 'TRANSFER_WITHDRAWN').length, 1);
  await assert.rejects(() => transfers.withdraw(coord, 'r1', 'missing'), e => e.status === 404);
  assert.equal((await ask(coord, { transferActionId: 'a2' })).status, 201); // a new request is allowed afterwards
});

test('the Lead declines with a reason; the Coordinator keeps the request', async () => {
  reset(); await ask();
  await assert.rejects(() => transfers.decline(lead, 'r1', 'a1', { reason: ' ' }), e => e.status === 422);
  for (const who of [coord, owner]) await assert.rejects(() => transfers.decline(who, 'r1', 'a1', { reason: 'No' }), e => e.status === 403);
  const out = await transfers.decline(lead, 'r1', 'a1', { reason: 'Nobody else is free' });
  assert.deepEqual([out.status, out.decisionReason, out.decidedById], ['DECLINED', 'Nobody else is free', 'l1']);
  assert.equal(state.requests[0].currentCoordinatorId, 'c1');
  assert.deepEqual(state.outbox.map(o => o.eventType), ['CoordinatorTransferRequested', 'CoordinatorTransferDeclined']);
  assert.equal((await transfers.decline(lead, 'r1', 'a1', { reason: 'Nobody else is free' })).status, 'DECLINED'); // replay
  const other = actor('l2', 'EVENT_COORDINATOR_LEAD', ['assignments.view']);
  await assert.rejects(() => transfers.decline(other, 'r1', 'a1', { reason: 'Again' }), e => e.status === 409);
  await assert.rejects(() => transfers.withdraw(coord, 'r1', 'a1'), e => e.status === 409); // already decided
});

test('a reassignment fulfils the open request with the new Coordinator, once', async () => {
  reset(); await ask();
  const done = await transfers.fulfilIn(fakeTx, 'r1', lead, 'c2');
  assert.deepEqual([done.status, done.newCoordinatorId, done.decidedById], ['FULFILLED', 'c2', 'l1']);
  assert.equal(await transfers.fulfilIn(fakeTx, 'r1', lead, 'c2'), null); // nothing left to fulfil
  reset();
  assert.equal(await transfers.fulfilIn(fakeTx, 'r1', lead, 'c2'), null); // a reassignment with no request is fine
});

test('the Lead sees only open requests still held by the Coordinator who asked', async () => {
  reset(); await ask();
  assert.equal((await transfers.listPending()).length, 1);
  state.requests[0].currentCoordinatorId = 'c2'; // reassigned another way
  assert.equal((await transfers.listPending()).length, 0);
  state.requests[0].currentCoordinatorId = 'c1'; state.requests[0].status = 'REJECTED'; // request closed
  assert.equal((await transfers.listPending()).length, 0);
});

test('reading: the current Coordinator and a Lead can; others cannot', async () => {
  reset(); await ask();
  for (const who of [coord, lead]) assert.equal((await transfers.list(who, 'r1')).items.length, 1);
  for (const who of [coord2, owner]) await assert.rejects(() => transfers.list(who, 'r1'), e => e.status === 403);
  await assert.rejects(() => transfers.list(coord, 'missing'), e => e.status === 404);
});
