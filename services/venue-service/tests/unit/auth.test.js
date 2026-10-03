const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSIONS } = require('../../src/auth');
const canonicalPermissions = require('../../../utils/role-permissions');

test('CS-venue-AUTH-01: mock role permissions match auth-service canonical permissions', () => {
  assert.deepEqual(ROLE_PERMISSIONS, canonicalPermissions);
});
