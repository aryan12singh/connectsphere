const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('user');
const prisma = require('../../src/db');
let api;
const headers = { 'x-internal-api-key': process.env.INTERNAL_API_KEY };
const profile = (i, extra = {}) => ({ email: `pg-${i}@example.test`, firstName: 'Database', lastName: 'User', role: 'EVENT_ORGANISER', company: 'PG Same Organisation', ...extra });
before(async () => { await prisma.user.deleteMany(); await prisma.organisation.deleteMany(); api = await start(require('../../src/app')); });
after(async () => { await api?.close(); await prisma.$disconnect(); });
test('TC-CS26-08 PostgreSQL concurrent Organiser signup resolves one real organisation', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api.http('/internal/users', { method: 'POST', headers, body: profile(i) })));
  for (const result of results) assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(new Set(results.map(r => r.body.organisationId)).size, 1);
  assert.equal(await prisma.organisation.count(), 1);
  assert.equal(await prisma.user.count(), 8);
});
test('TC-CS26-05 PostgreSQL duplicate profile rolls back newly created organisation', async () => {
  const result = await api.http('/internal/users', { method: 'POST', headers, body: profile(0, { company: 'Must Roll Back' }) });
  assert.equal(result.status, 409); assert.ok(result.body.error.fields.email);
  assert.equal(await prisma.organisation.count({ where: { name: 'Must Roll Back' } }), 0);
});
test('TC-CS26-12 PostgreSQL organisation IDs are server resolved and Attendee cannot claim membership', async () => {
  const other = await api.http('/internal/users', { method: 'POST', headers, body: profile('other', { company: 'Other Company', organisationId: 'claimed' }) });
  const attendee = await api.http('/internal/users', { method: 'POST', headers, body: profile('attendee', { role: 'ATTENDEE', organisationId: other.body.organisationId }) });
  assert.equal(other.status, 201); assert.notEqual(other.body.organisationId, 'claimed');
  assert.equal(attendee.status, 201); assert.equal(attendee.body.organisationId, null);
});
test('TC-CS26-06 staff provisioning and changes are rejected without database writes', async () => {
  const total = await prisma.user.count();
  for (const role of ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'SYSTEM_ADMINISTRATOR']) {
    assert.equal((await api.http('/internal/users', { method: 'POST', headers, body: profile(role, { role }) })).status, 400);
  }
  const staff = await prisma.user.create({ data: { email: 'seed-staff@example.test', firstName: 'Seed', lastName: 'Staff', role: 'VENUE_STAFF', roles: ['VENUE_STAFF'] } });
  assert.equal((await api.http(`/internal/users/${staff.id}`, { method: 'PATCH', headers, body: { role: 'ATTENDEE' } })).status, 400);
  assert.equal((await prisma.user.findUnique({ where: { id: staff.id } })).role, 'VENUE_STAFF');
  assert.equal(await prisma.user.count(), total + 1);
});
test('TC-CS26-13 private directory requires a credential and never exposes a password hash', async () => {
  assert.equal((await api.http('/internal/users')).status, 403);
  const result = await api.http('/internal/users', { headers });
  assert.equal(result.status, 200); assert.ok(result.body.users.length);
  for (const user of result.body.users) assert.equal(Object.hasOwn(user, 'passwordHash'), false);
});
