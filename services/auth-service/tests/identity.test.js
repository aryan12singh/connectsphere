const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Only service/database/identity boundaries are fixtures. The Express app,
// account validator, sessions and permission queries below are production code.
const NOW = Date.parse('2026-10-07T01:00:00Z');
const NativeDate = Date;
global.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
};
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:9/auth_db';
process.env.INTERNAL_API_KEY = 'identity-test-internal-only';
process.env.KEYCLOAK_URL = 'http://127.0.0.1:9';
process.env.KEYCLOAK_REALM = 'connectsphere';
process.env.KEYCLOAK_CLIENT_ID = 'auth-service';
process.env.KEYCLOAK_CLIENT_SECRET = 'fixture-only';
process.env.USER_SERVICE_URL = 'http://127.0.0.1:9';

const defaults = require('../../utils/role-permissions');
const policy = { sessionTtlHours: 24, idleTimeoutMinutes: 30, passwordMinLength: 8,
  passwordRequireUppercase: true, passwordRequireLowercase: true, passwordRequireDigit: true, passwordRequireSpecial: true };
let user, sessions, permissionRows, created, passwordValid, keycloakFailure;
function fixture(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
fixture('../src/db', {
  authSettings: { findUniqueOrThrow: async () => policy },
  session: {
    create: async ({ data }) => { const row = { id: randomUUID(), createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data }; sessions.push(row); return row; },
    findFirst: async ({ where }) => sessions.find(s => s.tokenHash === where.tokenHash && !s.revokedAt && s.expiresAt > where.expiresAt.gt) || null,
    update: async ({ where, data }) => Object.assign(sessions.find(s => s.id === where.id), data),
    updateMany: async ({ where, data }) => { const matching = sessions.filter(s => s.userId === where.userId && !s.revokedAt); matching.forEach(s => Object.assign(s, data)); return { count: matching.length }; },
  },
  rolePermission: { findMany: async ({ where } = {}) => permissionRows.filter(row => !where || (where.role?.in ? where.role.in.includes(row.role) : row.role === where.role)) },
  auditLog: { create: async () => ({}), findMany: async () => [], count: async () => 0 },
});
fixture('../src/clients/userService', {
  findUserByEmail: async email => email === user.email ? user : null,
  findUserById: async id => id === user.id ? user : null,
  createUser: async profile => { created.push(profile); return { id: randomUUID(), roles: [profile.role], organisationId: profile.company ? 'organisation-fixture' : null, ...profile }; },
  updateUser: async (_id, data) => Object.assign(user, data),
  listUsers: async () => ({ users: [user], total: 1 }),
});
fixture('../src/clients/keycloak', { checkPassword: async () => passwordValid });
fixture('../src/clients/keycloakAdmin', {
  createUser: async () => { if (keycloakFailure) throw keycloakFailure; return 'keycloak-fixture'; },
  deleteUser: async () => {},
  applySecuritySettings: async () => {},
});
const app = require('../src/app');
const sessionService = require('../src/services/session.service');
const { hashToken } = require('../src/lib/tokens');
let server, base;
before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.Date = NativeDate; await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  user = { id: 'user-fixture', email: 'organiser@example.test', firstName: 'Test', lastName: 'User', role: 'EVENT_ORGANISER', roles: ['EVENT_ORGANISER'], isActive: true };
  sessions = []; created = []; passwordValid = true; keycloakFailure = null;
  permissionRows = Object.entries(defaults).flatMap(([role, permissions]) => permissions.map(permission => ({ role, permission })));
});
async function http(path, { method = 'GET', body, token, internal = false } = {}) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(internal ? { 'x-internal-api-key': process.env.INTERNAL_API_KEY } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers };
}
const signup = (overrides = {}) => ({ email: 'new@example.test', firstName: 'New', lastName: 'User', password: 'Strong!1', ...overrides });
function storedToken(age, overrides = {}) {
  const token = randomUUID();
  sessions.push({ id: randomUUID(), userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(NOW + 60_000), revokedAt: null, lastUsedAt: new Date(NOW - age), createdAt: new Date(NOW - age), ...overrides });
  return token;
}

test('TC-CS10-01 real login creates a hashed session and returns every recognised role', async () => {
  user.roles = ['EVENT_ORGANISER', 'ATTENDEE'];
  const result = await http('/auth/login', { method: 'POST', body: { email: user.email, password: 'Strong!1' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.user.roles, user.roles);
  assert.equal(sessions[0].tokenHash, hashToken(result.body.token));
  assert.notEqual(sessions[0].tokenHash, result.body.token);
  assert.ok(result.body.permissions.includes('attendance.register'));
});
test('TC-CS10-02 wrong password and unknown account return the same error and no session', async () => {
  passwordValid = false;
  const wrong = await http('/auth/login', { method: 'POST', body: { email: user.email, password: 'wrong' } });
  passwordValid = true;
  const unknown = await http('/auth/login', { method: 'POST', body: { email: 'unknown@example.test', password: 'Strong!1' } });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body); assert.equal(sessions.length, 0);
});
test('TC-CS10-05 unknown or empty roles return 403 without starting a session', async () => {
  for (const roles of [[], ['SYSTEM_ADMINISTRATOR']]) {
    user.role = 'SYSTEM_ADMINISTRATOR'; user.roles = roles;
    const result = await http('/auth/login', { method: 'POST', body: { email: user.email, password: 'Strong!1' } });
    assert.equal(result.status, 403); assert.equal(sessions.length, 0);
  }
});
test('TC-CS10-05 losing every recognised role also denies internal session validation', async () => {
  const token = storedToken(0);
  user.role = 'SYSTEM_ADMINISTRATOR'; user.roles = [];
  const result = await http('/internal/sessions/validate', { method: 'POST', internal: true, body: { token } });
  assert.equal(result.status, 403); assert.equal(result.body.valid, false);
});
test('TC-CS10-04 logout revokes the actual token for both public and internal validation', async () => {
  const token = storedToken(0);
  assert.equal((await http('/auth/logout', { method: 'POST', token })).status, 204);
  assert.equal((await http('/auth/me', { token })).status, 401);
  assert.equal((await http('/internal/sessions/validate', { method: 'POST', internal: true, body: { token } })).status, 401);
});
for (const [age, status] of [[1_799_000, 200], [1_800_000, 401], [1_801_000, 401]]) {
  test(`TC-CS10-13 inactivity ${age / 1000}s has status ${status} at the 30-minute boundary`, async () => {
    const token = storedToken(age);
    assert.equal((await http('/auth/me', { token })).status, status);
    if (status === 401) assert.ok(sessions[0].revokedAt);
  });
}
test('TC-CS10-14 even a request within one minute records its exact last activity', async () => {
  const token = storedToken(30_000);
  assert.equal((await http('/auth/me', { token })).status, 200);
  assert.equal(sessions[0].lastUsedAt.getTime(), NOW);
});
test('TC-CS10-15 absolute expiry, disabled user and missing token deny protected access', async () => {
  assert.equal((await http('/auth/me')).status, 401);
  const token = storedToken(0, { expiresAt: new Date(NOW) });
  assert.equal((await http('/auth/me', { token })).status, 401);
  user.isActive = false;
  assert.equal((await http('/auth/me', { token: storedToken(0) })).status, 401);
});
test('TC-CS26-01 Attendee signup defaults safely and creates no session', async () => {
  const result = await http('/auth/register', { method: 'POST', body: signup() });
  assert.equal(result.status, 201); assert.equal(result.body.user.role, 'ATTENDEE'); assert.equal(sessions.length, 0);
});
test('TC-CS26-08 Organiser signup carries the organisation to user-service', async () => {
  const result = await http('/auth/register', { method: 'POST', body: signup({ role: 'EVENT_ORGANISER', company: 'Nexus Labs' }) });
  assert.equal(result.status, 201); assert.equal(result.body.user.role, 'EVENT_ORGANISER');
  assert.equal(created[0].company, 'Nexus Labs'); assert.equal(created[0].role, 'EVENT_ORGANISER');
});
test('TC-CS26-09 missing organisation and invalid fields give field-level errors without provisioning', async () => {
  const result = await http('/auth/register', { method: 'POST', body: signup({ role: 'EVENT_ORGANISER', company: '', email: 'invalid', firstName: '' }) });
  assert.equal(result.status, 400);
  for (const field of ['company', 'email', 'firstName']) assert.ok(result.body.error?.fields?.[field]);
  assert.equal(created.length, 0);
});
test('TC-CS26-05 duplicate email is a field-level 409 and creates no profile', async () => {
  keycloakFailure = Object.assign(new Error('A user with this email already exists'), { status: 409 });
  const result = await http('/auth/register', { method: 'POST', body: signup() });
  assert.equal(result.status, 409); assert.ok(result.body.error?.fields?.email); assert.equal(created.length, 0);
});
for (const role of ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'SYSTEM_ADMINISTRATOR']) {
  test(`TC-CS26-06 ${role} cannot be granted by signup or the staff user-creation endpoint`, async () => {
    assert.equal((await http('/auth/register', { method: 'POST', body: signup({ role }) })).status, 400);
    user.role = 'TECHNICAL_SUPPORT_STAFF'; user.roles = [user.role];
    const token = storedToken(0);
    assert.equal((await http('/admin/users', { method: 'POST', token, body: signup({ role }) })).status, 400);
    assert.equal((await http(`/admin/users/${user.id}/role`, { method: 'PATCH', token, body: { role } })).status, 400);
    assert.equal(created.length, 0);
  });
}
for (const [password, status] of [['Ab1!abc', 400], ['Ab1!abcd', 201], ['Ab1!abcde', 201]]) {
  test(`TC-CS26-07 password length ${password.length} has status ${status}`, async () => {
    const result = await http('/auth/register', { method: 'POST', body: signup({ password }) });
    assert.equal(result.status, status);
    if (status === 400) assert.ok(result.body.error?.fields?.password);
  });
}
test('TC-CS26-10 multi-role grants are a deduplicated union and removals take effect on the next request', async () => {
  user.roles = ['ATTENDEE', 'EVENT_ORGANISER']; user.role = 'ATTENDEE';
  const token = storedToken(0);
  const first = await sessionService.resolveToken(token);
  assert.ok(first.permissions.includes('event_requests.create'));
  assert.ok(first.permissions.includes('attendance.register'));
  assert.equal(first.permissions.length, new Set(first.permissions).size);
  permissionRows = permissionRows.filter(r => r.permission !== 'event_requests.create');
  assert.ok(!(await sessionService.resolveToken(token)).permissions.includes('event_requests.create'));
  user.roles = ['ATTENDEE'];
  assert.ok(!(await sessionService.resolveToken(token)).permissions.includes('messages.send'));
});
test('TC-CS26-11 protected user-management routes deny every non-support role even with an injected capability', async () => {
  for (const role of ['ATTENDEE', 'EVENT_ORGANISER', 'EVENT_COORDINATOR', 'VENUE_STAFF']) {
    user.role = role; user.roles = [role]; permissionRows.push({ role, permission: 'users.view' });
    assert.equal((await http('/admin/users', { token: storedToken(0) })).status, 403);
  }
});
