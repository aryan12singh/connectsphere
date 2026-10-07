const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:9/user_db';
process.env.INTERNAL_API_KEY = 'profile-test-internal-only';
let users, organisations;
const db = {
  user: {
    create: async ({ data }) => {
      if (users.some(u => u.email === data.email)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      const row = { id: randomUUID(), roles: [data.role], isActive: true, createdAt: new Date(), ...data }; users.push(row); return row;
    },
    findUnique: async ({ where }) => users.find(u => where.email ? u.email === where.email : u.id === where.id) || null,
    update: async ({ where, data }) => {
      const u = users.find(u => u.id === where.id);
      if (!u) throw Object.assign(new Error('missing'), { code: 'P2025' });
      return Object.assign(u, data);
    },
    findMany: async ({ where } = {}) => users.filter(u => !where?.roles || u.roles.includes(where.roles.has)),
    count: async () => users.length,
  },
  organisation: { upsert: async ({ where, create }) => { let org = organisations.find(o => o.name === where.name); if (!org) { org = { id: randomUUID(), ...create }; organisations.push(org); } return org; } },
  $transaction: async fn => { const savedUsers = [...users], savedOrgs = [...organisations]; try { return await fn(db); } catch (e) { users = savedUsers; organisations = savedOrgs; throw e; } },
};
const id = require.resolve('../src/db');
require.cache[id] = { id, filename: id, loaded: true, exports: db };
const app = require('../src/app');
let server, base;
before(async () => { server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => new Promise(resolve => server.close(resolve)));
beforeEach(() => { users = []; organisations = []; });
async function http(path, body, method = 'POST', authorised = true) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(authorised ? { 'x-internal-api-key': process.env.INTERNAL_API_KEY } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const profile = (overrides = {}) => ({ email: 'one@example.test', firstName: 'One', lastName: 'User', role: 'EVENT_ORGANISER', company: 'Nexus Labs', ...overrides });
test('TC-CS26-08 Organiser profile persists its server-resolved organisation link', async () => {
  const first = await http('/internal/users', profile());
  const second = await http('/internal/users', profile({ email: 'two@example.test' }));
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  assert.ok(first.body.organisationId);
  assert.equal(first.body.organisationId, second.body.organisationId);
  assert.equal(organisations.length, 1);
  assert.deepEqual(first.body.roles, ['EVENT_ORGANISER']);
});
test('TC-CS26-12 different organisations get distinct IDs; Attendee company is not an event membership', async () => {
  const first = await http('/internal/users', profile());
  const other = await http('/internal/users', profile({ email: 'other@example.test', company: 'Other Organisation' }));
  const attendee = await http('/internal/users', profile({ email: 'attendee@example.test', role: 'ATTENDEE', company: 'Nexus Labs', organisationId: first.body.organisationId }));
  assert.notEqual(first.body.organisationId, other.body.organisationId);
  assert.equal(attendee.body.organisationId, null);
});
test('TC-CS26-06 internal creation and role updates cannot grant any seed-only role', async () => {
  for (const role of ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF']) {
    assert.equal((await http('/internal/users', profile({ role }))).status, 400);
  }
  const { body: user } = await http('/internal/users', profile({ role: 'ATTENDEE', company: '' }));
  assert.equal((await http(`/internal/users/${user.id}`, { role: 'EVENT_COORDINATOR' }, 'PATCH')).status, 400);
  assert.equal(users[0].role, 'ATTENDEE');
});
test('TC-CS26-09 rejects invalid profile and missing Organiser company with fields before writes', async () => {
  const result = await http('/internal/users', profile({ company: '', email: 'invalid', firstName: '' }));
  assert.equal(result.status, 400);
  for (const field of ['company', 'email', 'firstName']) assert.ok(result.body.error?.fields?.[field]);
  assert.equal(users.length, 0); assert.equal(organisations.length, 0);
});
test('TC-CS26-05 duplicate email rolls back a newly proposed organisation', async () => {
  await http('/internal/users', profile());
  const result = await http('/internal/users', profile({ company: 'Must roll back' }));
  assert.equal(result.status, 409); assert.ok(result.body.error?.fields?.email);
  assert.deepEqual(organisations.map(o => o.name), ['Nexus Labs']);
});
test('TC-CS26-13 internal endpoints require the private credential and never expose password hashes', async () => {
  assert.equal((await http('/internal/users', profile(), 'POST', false)).status, 403);
  const { body: user } = await http('/internal/users', profile());
  const read = await http(`/internal/users/${user.id}`, undefined, 'GET');
  assert.equal(read.status, 200); assert.equal(Object.hasOwn(read.body, 'passwordHash'), false);
});
