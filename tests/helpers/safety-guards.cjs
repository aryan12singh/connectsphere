// Read-only isolated execution of the repository's actual Safety module.
// Invoked by canonical CS-93 guards; actual module, deterministic owned-DB adapters.
// Fake Prisma/RPC adapters never touch the running stack or any database.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const realLoad = Module._load;
const root=process.argv[2]||path.resolve(__dirname,'../..');
const target = path.resolve(root, 'services/event-service/src/safety.js');
const eventLock = path.resolve(root, 'services/event-service/src/eventLock.js');
const actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: ['safety.submit', 'safety.rework', 'events.confirm'] };
let state, logs;
const clone = x => JSON.parse(JSON.stringify(x));
const tx = {
  $queryRaw: async () => [],
  event: {
    findUnique: async () => clone(state),
    update: async ({ data }) => {
      for (const [k, v] of Object.entries(data)) state[k] = v && typeof v === 'object' && 'increment' in v ? (state[k] || 0) + v.increment : v;
      return clone(state);
    },
  },
  eventRequest: { findUnique: async () => clone(state.eventRequest) },
  safetyRound: { findUnique: async () => clone(state.round), update: async ({ data }) => Object.assign(state.round, data) },
  activityLog: { create: async ({ data }) => { logs.push(data); return data; } },
  outbox: { findMany:async()=>[],create: async ({ data }) => data },
  idempotencyRecord: { findUnique: async () => null, create: async () => ({}) },
};
const db = { ...tx, $transaction: async fn => fn(tx) };
Module._load = function (spec, parent, ...rest) {
  if ([target,eventLock].includes(parent?.filename) && spec === './db') return db;
  if (parent?.filename === target && spec === './config') return { bookingServiceUrl: 'http://booking', equipmentServiceUrl: 'http://equipment', internalApiKey: 'isolated' };
  if (spec === '@prisma/client') return { Prisma: { DbNull: null } };
  return realLoad.call(this, spec, parent, ...rest);
};
global.fetch = async url => ({ ok: true, status: 200, json: async () => String(url).startsWith('http://booking')
  ? { eventId: 'e1', venueReady: true, outstanding: [], fingerprint: 'venue-v1', snapshot: { venues: [{ bookingId: 'b1' }] } }
  : { eventId: 'e1', status: 'NOT_REQUIRED', fingerprint: 'tech-v1' } });
const safety = require(target);
function reset() {
  logs = [];
  state = {
    id: 'e1', eventRequestId: 'r1', organiserId: 'owner', title: 'Audit fixture', status: 'ARRANGEMENT_PENDING', version: 5,
    startAt: '2027-01-01T01:00:00Z', endAt: '2027-01-01T02:00:00Z',
    eventRequest: { id: 'r1', status: 'APPROVED', version: 2, currentCoordinatorId: actor.id, equipmentNeeds: [], technicalDetails: '', expectedAttendance: 10 },
    safetyState: 'PENDING', safetyToken: 'token1', safetyGeneration: 1, safetyRoundId: 'round1',
    round: { id: 'round1', eventId: 'e1', status: 'PENDING', token: 'token1', generation: 1, number: 1, requirementsRevision: 'old-revision', snapshot: { venues: [{ bookingId: 'b1' }] } },
  };
  state.round.snapshot.sourceRevision = safety.revision(state, state.eventRequest);
}
function req(body) { return { actor, body, get: () => 'isolated-audit-key' }; }
async function observe(label, action) {
  try { await action(); return { case: label, result: 'ACCEPTED', eventStatus: state.status, requestStatus: state.eventRequest.status, requestVersion: state.eventRequest.version, activityTransitions: logs.map(x => [x.fromStatus, x.toStatus]) }; }
  catch (error) { return { case: label, result: 'REJECTED', status: error.status, code: error.code, message: error.message, eventStatus: state.status, requestStatus: state.eventRequest.status }; }
}
(async () => {
  console.log(JSON.stringify({ module:'services/event-service/src/safety.js',sha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex'), executedAt: new Date().toISOString(), layer: 'isolated actual module with in-memory adapters; not live acceptance' }));
  reset(); state.status = 'REJECTED'; state.eventRequest.status = 'REJECTED';
  console.log(JSON.stringify(await observe('rework of rejected Event', () => safety.rework(req({ version: 5, roundId: 'round1', requirementsRevision: 'old-revision', note: 'Coordinator directs follow-up', bookingIds: [] }), state.id))));
  reset(); state.safetyState = 'APPROVED'; state.round.status = 'APPROVE'; state.eventRequest.version = 3; state.eventRequest.expectedAttendance = 11;
  console.log(JSON.stringify(await observe('confirmation after factual requirements change without fence invalidation', () => safety.advance(req({ version: 5 }), state.id, 'CONFIRMED'))));
  reset(); state.safetyState = 'APPROVED'; state.round.status = 'APPROVE';
  console.log(JSON.stringify(await observe('control: current approval confirms and logs actual transition', () => safety.advance(req({ version: 5 }), state.id, 'CONFIRMED'))));
  reset(); state.safetyState = 'APPROVED'; state.round.status = 'APPROVE'; state.eventRequest.version = 3;
  console.log(JSON.stringify(await observe('control: metadata-only request version change preserves factual approval', () => safety.advance(req({ version: 5 }), state.id, 'CONFIRMED'))));
})().catch(error => { console.error(error); process.exitCode = 1; });
