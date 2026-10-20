const test = require('node:test');
const assert = require('node:assert/strict');
const readiness = require('../../src/readiness');

test('readiness requires persistent fencing for prepare and validates an exact release token', async () => {
  await assert.rejects(() => readiness.prepare('event-1', { token: 'token-1', generation: 1 }), error => error.code === 'READINESS_UNAVAILABLE');
  await assert.rejects(() => readiness.release('event-1', ''), error => error.code === 'VALIDATION_FAILED');
  assert.deepEqual(await readiness.release('event-1', 'token-1'), { released: true });
});
