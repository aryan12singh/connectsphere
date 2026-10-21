const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireRole } = require('../../src/auth');

function request(headers) { return { actor: null, get: name => headers[name.toLowerCase()] }; }
function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
async function authenticate(headers) {
  const req = request(headers);
  const res = response();
  let continued = false;
  await requireAuth()(req, res, () => { continued = true; });
  return { req, res, continued };
}

test('auth accepts a complete test actor, denies incomplete identity, and checks required roles', async () => {
  const accepted = await authenticate({ 'x-test-user-id': 'attendee-1', 'x-test-role': 'ATTENDEE', 'x-test-event-access': 'event-1,event-2' });
  assert.equal(accepted.continued, true);
  assert.deepEqual(accepted.req.actor.permittedEventIds, ['event-1', 'event-2']);
  const denied = await authenticate({ 'x-test-user-id': 'attendee-1' });
  assert.equal(denied.res.statusCode, 401);
  assert.equal(denied.res.body.error.code, 'UNAUTHENTICATED');
  const req = { actor: { role: 'EVENT_COORDINATOR' } };
  let continued = false;
  requireRole('TECHNICAL_SUPPORT_STAFF')(req, response(), () => { continued = true; });
  assert.equal(continued, false);
  continued = false;
  requireRole('EVENT_COORDINATOR')(req, response(), () => { continued = true; });
  assert.equal(continued, true);
  continued = false;
  requireRole('ATTENDEE')(req, response(), () => { continued = true; });
  assert.equal(continued, false);
  continued = false;
  requireRole('EVENT_ORGANISER')(req, response(), () => { continued = true; });
  assert.equal(continued, false);
});

test('auth validates bearer sessions, rejects invalid upstream sessions, and handles auth outages', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).token, 'good-token');
    return Response.json({ valid: true, user: { id: 'attendee-1', role: 'ATTENDEE' }, permissions: ['read'] });
  };
  const accepted = await authenticate({ authorization: 'Bearer good-token' });
  assert.equal(accepted.continued, true);
  assert.deepEqual(accepted.req.actor.permissions, ['read']);
  global.fetch = async () => Response.json({ valid: false, user: null });
  assert.equal((await authenticate({ authorization: 'Bearer expired' })).res.statusCode, 401);
  global.fetch = async () => { throw new Error('unavailable'); };
  const unavailable = await authenticate({ authorization: 'Bearer token' });
  assert.equal(unavailable.res.statusCode, 503);
  assert.equal(unavailable.res.body.error.code, 'AUTH_UNAVAILABLE');
});
