const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireAnyPermission, resolveActor, internalOnly } = require('../../src/auth');

function request(headers = {}) {
  return { get(name) { return headers[name.toLowerCase()]; } };
}

function response() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

test('CS-venue-AUTH-02: test headers resolve a mock actor with canonical permissions', async () => {
  const actor = await resolveActor(request({ 'x-test-user-id': 'staff-1', 'x-test-role': 'VENUE_STAFF' }));
  assert.equal(actor.id, 'staff-1');
  assert.equal(actor.role, 'VENUE_STAFF');
  assert.ok(actor.permissions.includes('venues.manage'));
});

test('CS-venue-AUTH-03: bearer validation forwards token and internal key to auth service', async () => {
  const previousFetch = global.fetch;
  let call;
  global.fetch = async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ valid: true, user: { id: 'user-1', role: 'VENUE_STAFF' }, permissions: ['venues.view'] }) };
  };
  try {
    const actor = await resolveActor(request({ authorization: 'Bearer opaque-token' }));
    assert.equal(actor.id, 'user-1');
    assert.deepEqual(actor.permissions, ['venues.view']);
    assert.match(call.url, /internal\/sessions\/validate$/);
    assert.equal(JSON.parse(call.options.body).token, 'opaque-token');
    assert.ok(call.options.headers['x-internal-api-key']);
  } finally {
    global.fetch = previousFetch;
  }
});

test('CS-venue-AUTH-04: invalid and incomplete auth responses fail closed', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({}) });
  try {
    assert.equal(await resolveActor(request({ authorization: 'Bearer expired' })), null);
  } finally {
    global.fetch = previousFetch;
  }

  global.fetch = async () => ({ ok: true, json: async () => ({ valid: true, user: { id: 'user-1' } }) });
  try {
    assert.equal(await resolveActor(request({ authorization: 'Bearer incomplete' })), null);
  } finally {
    global.fetch = previousFetch;
  }
});

test('CS-venue-AUTH-05: auth middleware returns 401, 503, or next for the matching boundary outcome', async () => {
  const middleware = requireAuth();
  let nextCalled = false;
  const unauthorized = response();
  await middleware(request(), unauthorized, () => { nextCalled = true; });
  assert.equal(unauthorized.result.statusCode, 401);
  assert.equal(nextCalled, false);

  const previousFetch = global.fetch;
  const previousError = console.error;
  global.fetch = async () => { throw new Error('auth unavailable'); };
  console.error = () => {};
  try {
    const unavailable = response();
    await middleware(request({ authorization: 'Bearer token' }), unavailable, () => {});
    assert.equal(unavailable.result.statusCode, 503);
  } finally {
    global.fetch = previousFetch;
    console.error = previousError;
  }

  const authenticated = response();
  await middleware(request({ 'x-test-user-id': 'staff-1', 'x-test-role': 'VENUE_STAFF' }), authenticated, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('CS-venue-AUTH-06: any-permission middleware allows one match and rejects no matches', () => {
  const allowed = response();
  let nextCalled = false;
  requireAnyPermission('venues.view', 'venues.manage')({ actor: { role: 'VENUE_STAFF', permissions: ['venues.manage'] } }, allowed, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(allowed.result.statusCode, 200);

  const denied = response();
  requireAnyPermission('venues.view', 'venues.manage')({ actor: { permissions: [] } }, denied, () => {});
  assert.equal(denied.result.statusCode, 403);
});

test('TC-CS26-04 venue capabilities never let a public role impersonate staff', () => {
  for (const role of ['ATTENDEE', 'EVENT_ORGANISER']) {
    for (const permission of ['venues.view', 'venues.manage']) {
      const denied = response();
      requireAnyPermission(permission)({ actor: { role, permissions: [permission] } }, denied, () => {});
      assert.equal(denied.result.statusCode, 403);
    }
  }
});

test('CS-venue-AUTH-07: internal routes require the private service credential', () => {
  const denied = response();
  internalOnly(request(), denied, () => {});
  assert.equal(denied.result.statusCode, 403);

  const allowed = response();
  internalOnly(request({ 'x-internal-api-key': 'change-me-dev-internal-key' }), allowed, () => { allowed.result.next = true; });
  assert.equal(allowed.result.next, true);
});
