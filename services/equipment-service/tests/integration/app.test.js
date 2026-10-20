const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATA_MODE = 'memory';
process.env.NODE_ENV = 'test';
const app = require('../../src/app');

test('HTTP app exposes health, not-found, and malformed-JSON boundaries', async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const missing = await fetch(`${base}/no-such-route`, { headers: { 'x-test-user-id': 'coordinator-parse', 'x-test-role': 'EVENT_COORDINATOR' } });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  const malformed = await fetch(`${base}/event-requests/event-parse/technical-request`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user-id': 'coordinator-parse', 'x-test-role': 'EVENT_COORDINATOR' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'BAD_REQUEST');
});

test('Equipment readiness endpoints are internal-only and fail closed without technical proof', async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/internal/events/no-proof/readiness`)).status, 401);
  const response = await fetch(`${base}/internal/events/no-proof/readiness`, { headers: { 'x-internal-api-key': 'change-me-dev-internal-key' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { eventId: 'no-proof', status: 'UNVERIFIED', reason: 'TECHNICAL_REQUEST_MISSING', equipment: [] });
});
