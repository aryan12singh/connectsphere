const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, isKnownPermission } = require('../src/lib/permissions');
const { hasPermission } = require('../../utils/role-policy');

const permission = 'events.technical.metadata.view';

test('CS-41 scoped technical metadata permission is known and restricted to Technical Support', () => {
  assert.equal(isKnownPermission(permission), true);
  assert.ok(PERMISSIONS[permission]);
  assert.equal(hasPermission({ role: 'TECHNICAL_SUPPORT_STAFF', permissions: [permission] }, permission), true);
  assert.equal(hasPermission({ role: 'EVENT_COORDINATOR', permissions: [permission] }, permission), false);
  assert.equal(hasPermission({ role: 'TECHNICAL_SUPPORT_STAFF', permissions: [] }, permission), false);
});
