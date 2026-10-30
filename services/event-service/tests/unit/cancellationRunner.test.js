// CS-54: the cancellation runner. A fake database and fake booking/equipment clients
// stand in for the real services, so this runs with the other unit tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runPending, venueReceipt, equipmentReceipt } = require('../../src/cancellationRunner');

const intent = (id, eventId = 'e-' + id) => ({ id, eventId, acceptedEventVersion: 4 });
const fakeDb = intents => ({ eventCancellationIntent: { findMany: async () => intents } });
const venueOk = (i, extra = {}) => ({ receiptId: 'v-' + i.id, resource: 'VENUE', eventId: i.eventId, eventVersion: i.acceptedEventVersion, cancellationActionId: i.id, ...extra });
const equipOk = (i, extra = {}) => ({ eventId: i.eventId, cancellationActionId: i.id, released: [], ...extra });

function setup(intents, over = {}) {
  const calls = { venue: [], equipment: [], finalize: [] };
  const clients = {
    releaseVenue: async (eventId, body) => { calls.venue.push([eventId, body]); return (over.venue || venueOk)(intents.find(i => i.eventId === eventId)); },
    releaseEquipment: async (eventId, body) => { calls.equipment.push([eventId, body]); return (over.equipment || equipOk)(intents.find(i => i.eventId === eventId)); },
  };
  const finalize = async (eventId, body) => { calls.finalize.push([eventId, body]); if (over.finalize) return over.finalize(eventId, body); return { status: 'CANCELLED' }; };
  return { calls, args: { prisma: fakeDb(intents), clients, finalize } };
}

test('releases venue and equipment, then finalizes with both receipts', async () => {
  const a = intent('a');
  const { calls, args } = setup([a]);
  assert.deepEqual(await runPending(args), { finalized: 1, failed: 0 });
  assert.deepEqual(calls.venue[0], ['e-a', { eventVersion: 4, cancellationActionId: 'a' }]);
  assert.deepEqual(calls.equipment[0], ['e-a', { cancellationActionId: 'a' }]);
  const [eventId, body] = calls.finalize[0];
  assert.equal(eventId, 'e-a');
  assert.equal(body.cancellationActionId, 'a');
  assert.deepEqual(body.receipts, [
    { resource: 'VENUE', receiptId: 'v-a', cancellationActionId: 'a', eventVersion: 4 },
    { resource: 'EQUIPMENT', receiptId: 'equipment:a', cancellationActionId: 'a', eventVersion: 4 },
  ]);
  assert.equal(body.receipts.some(r => r.resource === 'REGISTRATION'), false);
});

test('the same input gives the same receipts, so a retry is a replay', async () => {
  const a = intent('a');
  const one = setup([a]); const two = setup([a]);
  await runPending(one.args); await runPending(two.args);
  assert.deepEqual(one.calls.finalize[0][1], two.calls.finalize[0][1]);
});

test('a failed venue release stops that Event before equipment and finalize, and others still run', async () => {
  const a = intent('a'), b = intent('b');
  const { calls, args } = setup([a, b], { venue: i => { if (i.id === 'a') throw new Error('booking down'); return venueOk(i); } });
  const quiet = console.error; console.error = () => {};
  try { assert.deepEqual(await runPending(args), { finalized: 1, failed: 1 }); } finally { console.error = quiet; }
  assert.deepEqual(calls.equipment.map(c => c[0]), ['e-b']);
  assert.deepEqual(calls.finalize.map(c => c[0]), ['e-b']);
});

test('a failed equipment release or a refused finalize leaves the Event for the next pass', async () => {
  const quiet = console.error; console.error = () => {};
  try {
    const a = intent('a');
    const eq = setup([a], { equipment: () => { throw new Error('equipment down'); } });
    assert.deepEqual(await runPending(eq.args), { finalized: 0, failed: 1 });
    assert.equal(eq.calls.finalize.length, 0);
    const fin = setup([a], { finalize: () => { throw Object.assign(new Error('not cancelling'), { status: 409 }); } });
    assert.deepEqual(await runPending(fin.args), { finalized: 0, failed: 1 });
  } finally { console.error = quiet; }
});

test('a reply for a different Event or action is not trusted', () => {
  const a = intent('a');
  assert.throws(() => venueReceipt(a, venueOk(a, { cancellationActionId: 'other' })));
  assert.throws(() => venueReceipt(a, venueOk(a, { eventVersion: 3 })));
  assert.throws(() => venueReceipt(a, venueOk(a, { receiptId: ' ' })));
  assert.throws(() => venueReceipt(a, venueOk(a, { resource: 'EQUIPMENT' })));
  assert.throws(() => equipmentReceipt(a, equipOk(a, { eventId: 'e-x' })));
  assert.throws(() => equipmentReceipt(a, null));
  assert.equal(equipmentReceipt(a, equipOk(a)).receiptId, 'equipment:a');
});

test('nothing waiting, or no database, does nothing', async () => {
  assert.deepEqual(await runPending(setup([]).args), { finalized: 0, failed: 0 });
  assert.deepEqual(await runPending({ prisma: null }), { finalized: 0, failed: 0 });
});
