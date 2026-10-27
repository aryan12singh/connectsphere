const test = require('node:test');
const assert = require('node:assert/strict');
const { retryDelaySeconds } = require('./outbox-relay');

test('outbox retries use the bounded 2, 4, 8, 16, 32, then 60 second schedule', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelaySeconds), [2, 4, 8, 16, 32, 60, 60, 60]);
});
