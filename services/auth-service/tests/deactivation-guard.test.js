const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Session 3 / DEF-53-08: a Coordinator with open Events cannot be deactivated
// until the Lead reassigns them. Only service and identity boundaries are
// fixtures; the admin route, sessions and permission checks are production code.
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:9/auth_db';
process.env.INTERNAL_API_KEY = 'deactivation-test-internal-only';
process.env.KEYCLOAK_URL = 'http://127.0.0.1:9';
process.env.KEYCLOAK_REALM = 'connectsphere';
process.env.KEYCLOAK_CLIENT_ID = 'auth-service';
process.env.KEYCLOAK_CLIENT_SECRET = 'fixture-only';
process.env.USER_SERVICE_URL = 'http://127.0.0.1:9';

const defaults = require('../../utils/role-permissions');
const { hashToken } = require('../src/lib/tokens');
let users, sessions, enabled, revoked, openAssignments;
function fixture(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const policy = { sessionTtlHours: 24, idleTimeoutMinutes: 30 };
const permissionRows = Object.entries(defaults).flatMap(([role, permissions]) => permissions.map(permission => ({ role, permission })));
fixture('../src/db', {
  authSettings: { findUniqueOrThrow: async () => policy },
  session: {
    findFirst: async ({ where }) => sessions.find(s => s.tokenHash === where.tokenHash && !s.revokedAt) || null,
    update: async ({ where, data }) => Object.assign(sessions.find(s => s.id === where.id), data),
    updateMany: async ({ where }) => { revoked.push(where.userId); return { count: 1 }; },
  },
  rolePermission: { findMany: async ({ where } = {}) => permissionRows.filter(row => !where || (where.role?.in ? where.role.in.includes(row.role) : row.role === where.role)) },
  auditLog: { create: async () => ({}) },
});
fixture('../src/clients/userService', {
  findUserById: async id => users[id] || null,
  updateUser: async (id, data) => Object.assign(users[id], data),
});
fixture('../src/clients/keycloakAdmin', {
  findUserIdByEmail: async email => `kc-${email}`,
  setUserEnabled: async (id, value) => { enabled.push([id, value]); },
});
fixture('../src/clients/eventService', { openAssignments: async id => openAssignments(id) });
const app = require('../src/app');
let server, base, token;
before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  const person = (id, role) => ({ id, email: `${id}@example.test`, firstName: id, lastName: 'Fixture', role, roles: [role], isActive: true });
  users = { support: person('support', 'TECHNICAL_SUPPORT_STAFF'), coord: person('coord', 'EVENT_COORDINATOR'), venue: person('venue', 'VENUE_STAFF') };
  enabled = []; revoked = [];
  token = randomUUID();
  sessions = [{ id: randomUUID(), userId: 'support', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), revokedAt: null, lastUsedAt: new Date(), createdAt: new Date() }];
});
const disable = id => fetch(`${base}/admin/users/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ isActive: false }) })
  .then(async response => ({ status: response.status, body: await response.json() }));

test('CS-30 a Coordinator with open Events is not deactivated and the Lead is named as the next step', async () => {
  openAssignments = async () => ({ count: 2, requests: [{ id: 'r1', eventName: 'Tech Summit', status: 'CONFIRMED' }, { id: 'r2', eventName: 'Gala', status: 'SUBMITTED' }] });
  const result = await disable('coord');
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'COORDINATOR_HAS_OPEN_EVENTS');
  assert.match(result.body.error.message, /2 open event request\(s\).*Coordinator Lead to reassign/);
  assert.deepEqual(result.body.error.requests.map(r => r.id), ['r1', 'r2']);
  assert.equal(users.coord.isActive, true);
  assert.deepEqual(enabled, [], 'the login stays enabled');
  assert.deepEqual(revoked, [], 'sessions are kept');
});

test('CS-30 a Coordinator whose Events were all reassigned can be deactivated', async () => {
  openAssignments = async () => ({ count: 0, requests: [] });
  const result = await disable('coord');
  assert.equal(result.status, 200);
  assert.equal(users.coord.isActive, false);
  assert.deepEqual(enabled, [['kc-coord@example.test', false]]);
  assert.deepEqual(revoked, ['coord']);
});

test('CS-30 deactivation is refused when the open-Event check cannot be made', async () => {
  openAssignments = async () => { throw new Error('event-service down'); };
  const result = await disable('coord');
  assert.equal(result.status, 503);
  assert.equal(users.coord.isActive, true);
  assert.deepEqual(enabled, []);
});

test('CS-30 other staff are deactivated without an assignment check', async () => {
  openAssignments = async () => { throw new Error('must not be called'); };
  assert.equal((await disable('venue')).status, 200);
  assert.equal(users.venue.isActive, false);
});
