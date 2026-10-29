// CS-31 / CS-32: automatic Completed once the end time passes. A fake database
// stands in for Prisma, so this runs with the other unit tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { completeEnded } = require('../../src/completion');

const NOW = new Date('2026-11-20T10:00:01Z');
function fakeDb(events) {
  const log = { updates: [], activity: [] };
  const matches = (e, where) => where.status.in.includes(e.status) && e.endAt <= where.endAt.lte;
  const db = {
    log,
    event: {
      findMany: async ({ where }) => events.filter(e => matches(e, where)).map(e => ({ id: e.id })),
      update: async ({ where, data }) => { const e = events.find(x => x.id === where.id); e.status = data.status; log.updates.push({ id: where.id, status: data.status }); },
    },
    activityLog: { create: async ({ data }) => { log.activity.push(data); } },
    $transaction: async fn => fn(db),
  };
  return db;
}
const ev = (id, status, endAt) => ({ id, status, endAt: new Date(endAt), startAt: new Date('2026-11-20T01:00:00Z'), timeZone: 'Asia/Singapore', organiserId: 'o', eventRequestId: 'r-' + id, eventRequest: { currentCoordinatorId: 'c' } });
const lockFrom = events => async (_tx, id) => events.find(e => e.id === id);

test('completes Confirmed events whose end time has passed, once each', async () => {
  const events = [ev('a', 'CONFIRMED', '2026-11-20T10:00:00Z'), ev('b', 'CONFIRMED', '2026-11-20T09:00:00Z')];
  const db = fakeDb(events);
  assert.deepEqual(await completeEnded({ prisma: db, now: NOW, lockEvent: lockFrom(events) }), { completed: 2, skipped: 0 });
  assert.deepEqual(events.map(e => e.status), ['COMPLETED', 'COMPLETED']);
  assert.equal(db.log.activity.length, 2);
  assert.deepEqual([db.log.activity[0].actorType, db.log.activity[0].actorId, db.log.activity[0].fromStatus, db.log.activity[0].toStatus], ['SYSTEM', null, 'CONFIRMED', 'COMPLETED']);
  // a second pass finds nothing: no double completion, no duplicate history
  assert.deepEqual(await completeEnded({ prisma: db, now: NOW, lockEvent: lockFrom(events) }), { completed: 0, skipped: 0 });
  assert.equal(db.log.activity.length, 2);
});

test('a Preparation event completes exactly when the transition table allows it', async () => {
  // The table is the single authority. Before the CS-32 change it only allows
  // Confirmed -> Completed, so a Preparation event waits (skipped, unchanged).
  const { TABLE } = require('../../src/domain/transitions');
  const allowed = TABLE.COMPLETE.some(row => row.from.includes('PREPARATION'));
  const events = [ev('p', 'PREPARATION', '2026-11-20T09:00:00Z')];
  const db = fakeDb(events);
  const result = await completeEnded({ prisma: db, now: NOW, lockEvent: lockFrom(events) });
  assert.deepEqual(result, allowed ? { completed: 1, skipped: 0 } : { completed: 0, skipped: 1 });
  assert.equal(events[0].status, allowed ? 'COMPLETED' : 'PREPARATION');
});

test('does not complete events that have not ended, or that are Planning, Cancelling or Rejected', async () => {
  const events = [
    ev('not-ended', 'CONFIRMED', '2026-11-20T10:00:02Z'),
    ev('planning', 'ARRANGEMENT_PENDING', '2026-11-20T08:00:00Z'),
    ev('cancelling', 'CANCELLING', '2026-11-20T08:00:00Z'),
    ev('rejected', 'REJECTED', '2026-11-20T08:00:00Z'),
  ];
  const db = fakeDb(events);
  assert.deepEqual(await completeEnded({ prisma: db, now: NOW, lockEvent: lockFrom(events) }), { completed: 0, skipped: 0 });
  assert.deepEqual(events.map(e => e.status), ['CONFIRMED', 'ARRANGEMENT_PENDING', 'CANCELLING', 'REJECTED']);
});

test('an Event that changed after it was listed is left alone, not completed', async () => {
  const events = [ev('a', 'CONFIRMED', '2026-11-20T09:00:00Z')];
  const db = fakeDb(events);
  // a cancellation wins the race: by the time the lock is taken the status moved on
  const lock = async (_tx, id) => { const e = events.find(x => x.id === id); e.status = 'CANCELLING'; return e; };
  assert.deepEqual(await completeEnded({ prisma: db, now: NOW, lockEvent: lock }), { completed: 0, skipped: 1 });
  assert.equal(events[0].status, 'CANCELLING');
  assert.equal(db.log.activity.length, 0);
});

test('without a database it does nothing', async () => {
  assert.deepEqual(await completeEnded({ prisma: null }), { completed: 0, skipped: 0 });
});
