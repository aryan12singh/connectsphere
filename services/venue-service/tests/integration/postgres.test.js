const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('venue');
const prisma = require('../../src/db');
let api, venue;
const staff = { 'x-test-user-id': 'venue-staff', 'x-test-role': 'VENUE_STAFF' };
const values = { name: 'PG Venue', address: 'Test Address', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: [], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'venue-staff', reason: 'PG verification', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '00:00', closesAt: '23:59' }] };
before(async () => { await prisma.venue.deleteMany(); api = await start(require('../../src/app')); });
after(async () => { await api?.close(); await prisma.$disconnect(); });
test('TC-CS33-01 PostgreSQL venue creation atomically persists hours and history', async () => {
  const result = await api.http('/venues', { method: 'POST', headers: staff, body: values });
  assert.equal(result.status, 201); venue = result.body;
  assert.equal(await prisma.venueOperatingHour.count({ where: { venueId: venue.id } }), 1);
  assert.equal(await prisma.venueHistory.count({ where: { venueId: venue.id } }), 1);
});
test('TC-CS33-09 invalid create and both edit routes preserve PostgreSQL data and history', async () => {
  const before = await prisma.venue.findUnique({ where: { id: venue.id }, include: { operatingHours: true, history: true } });
  for (const closesAt of ['08:00', '09:00']) {
    const operatingHours = [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt }];
    for (const [path, method, body] of [['/venues', 'POST', { ...values, operatingHours }], [`/venues/${venue.id}`, 'PUT', { ...values, operatingHours }], [`/venues/${venue.id}/operating-hours`, 'PUT', { items: operatingHours, reason: 'Invalid edit' }]]) {
      const result = await api.http(path, { method, headers: staff, body });
      assert.equal(result.status, 422); assert.ok(result.body.error.fields['operatingHours.0.time']);
    }
  }
  assert.equal(await prisma.venue.count(), 1);
  assert.deepEqual(await prisma.venue.findUnique({ where: { id: venue.id }, include: { operatingHours: true, history: true } }), before);
});
test('TC-CS33-08 internal roles can view; only Venue Staff can mutate', async () => {
  for (const role of ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'EVENT_ORGANISER', 'ATTENDEE']) {
    const headers = { 'x-test-user-id': role, 'x-test-role': role };
    assert.equal((await api.http(`/venues/${venue.id}`, { headers })).status, ['EVENT_ORGANISER', 'ATTENDEE'].includes(role) ? 403 : 200);
    assert.equal((await api.http(`/venues/${venue.id}`, { method: 'PUT', headers, body: values })).status, role === 'VENUE_STAFF' ? 200 : 403);
  }
});
