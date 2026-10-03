const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSIONS, resolveActor } = require('../../src/auth');
const canonicalPermissions = require('../../../utils/role-permissions');

test('CS-booking-AUTH-01: mock role permissions match auth-service canonical permissions', () => {
  assert.deepEqual(ROLE_PERMISSIONS, canonicalPermissions);
});

test('CS-booking-AUTH-02: a valid auth response without permissions fails closed', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ valid: true, user: { id: 'user-1', role: 'VENUE_STAFF' } }),
  });
  try {
    const actor = await resolveActor({
      get(name) {
        return name.toLowerCase() === 'authorization' ? 'Bearer session-token' : undefined;
      },
    });
    assert.equal(actor, null);
  } finally {
    global.fetch = previousFetch;
  }
});
