const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('booking');
const prisma = require('../../src/db');
const defaults = require('../../../utils/role-permissions');
let api, booking, actor, assigned = true, assignmentUnavailable = false;
const nativeFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).endsWith('/internal/sessions/validate')) return { ok: true, json: async () => ({ valid: true, user: actor, permissions: actor.permissions }) };
  if (String(url).includes('/booking-access') && assignmentUnavailable) throw new Error('Isolated upstream outage');
  if (String(url).includes('/booking-access')) return { ok: assigned && String(url).includes('/assigned-event/'), status: assigned && String(url).includes('/assigned-event/') ? 200 : 403, json: async () => ({ id: 'assigned-event' }) };
  return nativeFetch(url, options);
};
const headers = { authorization: 'Bearer isolated-fixture', 'idempotency-key': randomUUID() };
const values = { eventId: 'assigned-event', venueId: 'pg-venue', title: 'Early local Monday', reason: 'PG calendar verification', startAt: '2026-12-20T16:30:00Z', endAt: '2026-12-20T17:30:00Z', timeZone: 'Asia/Singapore', status: 'TENTATIVELY_HELD' };
before(async () => { await prisma.venueBookingRequest.deleteMany(); api = await start(require('../../src/app')); });
after(async () => { global.fetch = nativeFetch; await api?.close(); await prisma.$disconnect(); });
test('TC-CS34-07 UTC query for the complete local day returns its early Monday booking', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: [...defaults.EVENT_COORDINATOR] };
  const created = await api.http('/venue-bookings', { method: 'POST', headers, body: values });
  assert.equal(created.status, 201); booking = created.body;
  const result = await api.http('/venue-bookings/availability?venueId=pg-venue&startAt=2026-12-20T16:00:00Z&endAt=2026-12-21T16:00:00Z', { headers });
  assert.equal(result.status, 200); assert.equal(result.body.items[0].id, booking.id);
  assert.equal(await prisma.venueBookingActivity.count({ where: { bookingId: booking.id } }), 1);
});
test('TC-CS34-12 Technical Support reads availability but cannot decide or create', async () => {
  actor = { id: 'support', role: 'TECHNICAL_SUPPORT_STAFF', roles: ['TECHNICAL_SUPPORT_STAFF'], permissions: ['venues.view', 'venue_bookings.decide', 'venue_bookings.create'] };
  const result = await api.http('/venue-bookings/availability?venueId=pg-venue&startAt=2026-12-20T16:00:00Z&endAt=2026-12-21T16:00:00Z', { headers });
  assert.equal(result.status, 200);
  assert.equal((await api.http('/venue-bookings', { method: 'POST', headers, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'CONFIRMED' } })).status, 403);
});
test('TC-CS26-10 secondary Venue Staff role can decide; revocation blocks staff mutations', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR', 'VENUE_STAFF'], permissions: ['venue_bookings.create', 'venue_bookings.decide', 'venues.view'] };
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'CONFIRMED' } })).status, 200);
  actor.permissions = ['venue_bookings.create', 'venues.view'];
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: { ...values, status: 'BLOCKED' } })).status, 403);
  assert.equal((await prisma.venueBookingRequest.findUnique({ where: { id: booking.id } })).status, 'CONFIRMED');
});

test('TC-CS26-14 Coordinator cannot link another event or act after assignment is revoked', async () => {
  actor = { id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: [...defaults.EVENT_COORDINATOR] };
  const before = await prisma.venueBookingRequest.count();
  const other = await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: { ...values, eventId: 'other-event' } });
  assert.equal(other.status, 403); assert.equal(await prisma.venueBookingRequest.count(), before);
  const historyBefore = await prisma.venueBookingActivity.count();
  assigned = false;
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { headers })).status, 403);
  assert.equal((await api.http(`/venue-bookings/${booking.id}`, { method: 'PUT', headers, body: { ...values, status: 'CANCELLED' } })).status, 403);
  assert.deepEqual((await api.http('/venue-bookings', { headers })).body.items, []);
  assert.deepEqual((await api.http('/venue-bookings/history?venueId=pg-venue', { headers })).body.items, []);
  assert.equal(await prisma.venueBookingActivity.count(), historyBefore);
  assigned = true;
});

test('TC-CS26-14 Event assignment outage returns 503 without booking or history writes', async () => {
  const counts = await Promise.all([prisma.venueBookingRequest.count(), prisma.venueBookingActivity.count()]);
  assignmentUnavailable = true;
  try {
    assert.equal((await api.http('/venue-bookings', { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: values })).status, 503);
    assert.equal((await api.http('/venue-bookings', { headers })).status, 503);
    assert.equal((await api.http('/venue-bookings/history?venueId=pg-venue', { headers })).status, 503);
  } finally { assignmentUnavailable = false; }
  assert.deepEqual(await Promise.all([prisma.venueBookingRequest.count(), prisma.venueBookingActivity.count()]), counts);
});
