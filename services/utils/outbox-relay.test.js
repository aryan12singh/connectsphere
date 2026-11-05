const test = require('node:test');
const assert = require('node:assert/strict');
const { retryDelaySeconds } = require('./outbox-relay');

test('outbox retries use the bounded 2, 4, 8, 16, 32, then 60 second schedule', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelaySeconds), [2, 4, 8, 16, 32, 60, 60, 60]);
});

test('CS-51 AC3/AC4: the equipment relay sends every notified technical intent, not only releases', () => {
  const { OUTBOX_SCHEMAS, EQUIPMENT_RELAYED } = require('./outbox-relay');
  const { NOTIFIED } = require('../equipment-service/src/domainOutbox');
  for (const type of [...NOTIFIED, 'EquipmentReleased']) {
    assert.ok(EQUIPMENT_RELAYED.includes(type), `${type} is relayed`);
    assert.match(OUTBOX_SCHEMAS.equipment.filter, new RegExp(`'${type}'`));
  }
  assert.doesNotMatch(OUTBOX_SCHEMAS.equipment.filter, /TechRequestDeclaredNotRequired/);
});
