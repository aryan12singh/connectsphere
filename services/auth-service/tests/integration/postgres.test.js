const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase, start } = require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('auth');
// The user/Keycloak boundaries are fixtures here; the full-stack browser suite uses both real services.
let user = { id: 'pg-user', email: 'pg@example.test', role: 'EVENT_ORGANISER', roles: ['EVENT_ORGANISER', 'ATTENDEE'], isActive: true };
for (const [path, exports] of Object.entries({ '../../src/clients/userService': { findUserById: async () => user, findUserByEmail: async () => user }, '../../src/clients/keycloak': { checkPassword: async () => true } })) {
  const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports };
}
const prisma = require('../../src/db');
const { hashToken } = require('../../src/lib/tokens');
let api, token;
before(async () => { await prisma.session.deleteMany(); await prisma.authSettings.update({ where: { id: 1 }, data: { idleTimeoutMinutes: 30 } }); api = await start(require('../../src/app')); });
after(async () => { await api?.close(); await prisma.$disconnect(); });
test('TC-CS10-01 login persists only a hash and reads a multi-role permission union from PostgreSQL', async () => {
  const login = await api.http('/auth/login', { method: 'POST', body: { email: user.email, password: 'fixture-password' } });
  assert.equal(login.status, 200); token = login.body.token;
  const stored = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  assert.ok(stored); assert.notEqual(stored.tokenHash, token);
  assert.ok(login.body.permissions.includes('event_requests.create')); assert.ok(login.body.permissions.includes('attendance.register'));
});
test('TC-CS26-10 permission revocation in PostgreSQL takes effect on the next request', async () => {
  await prisma.rolePermission.delete({ where: { role_permission: { role: 'EVENT_ORGANISER', permission: 'event_requests.create' } } });
  const me = await api.http('/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200); assert.ok(!me.body.permissions.includes('event_requests.create'));
  await prisma.rolePermission.create({ data: { role: 'EVENT_ORGANISER', permission: 'event_requests.create' } });
});
test('TC-CS34-12 seeded Technical Support can read venue data without booking decision rights', async () => {
  const rows = await prisma.rolePermission.findMany({ where: { role: 'TECHNICAL_SUPPORT_STAFF' } });
  assert.ok(rows.some(r => r.permission === 'venues.view'));
  assert.ok(!rows.some(r => r.permission === 'venue_bookings.decide' || r.permission === 'venues.manage'));
});
test('TC-CS10-13 expired idle session is durably revoked', async () => {
  await prisma.session.update({ where: { tokenHash: hashToken(token) }, data: { lastUsedAt: new Date(Date.now() - 1_801_000) } });
  assert.equal((await api.http('/auth/me', { headers: { authorization: `Bearer ${token}` } })).status, 401);
  assert.ok((await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })).revokedAt);
});
