const test = require('node:test');
const assert = require('node:assert/strict');
const { loginWithBackoff } = require('./smoke/login-backoff.cjs');

function response(status, retryAfter) {
  return { status, body: { fixture: true }, headers: new Headers(retryAfter === undefined ? {} : { 'retry-after': retryAfter }) };
}

test('CI-login-01: gateway 429 honors Retry-After and preserves the eventual authenticated response', async () => {
  const authenticated = response(200);
  const queue = [response(429, '2'), authenticated];
  const waits = [];
  const result = await loginWithBackoff(async () => queue.shift(), { sleep: async ms => waits.push(ms) });
  assert.equal(result, authenticated);
  assert.deepEqual(waits, [2000]);
  assert.equal(queue.length, 0);
});

test('CI-login-02: persistent rate limiting stops after three setup attempts and bounded waits', async () => {
  let attempts = 0;
  const waits = [];
  const limited = response(429, '3600');
  const result = await loginWithBackoff(async () => { attempts++; return limited; }, { sleep: async ms => waits.push(ms) });
  assert.equal(result, limited);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [60000, 60000]);
});

test('CI-login-03: missing or malformed Retry-After uses the gateway minute window', async () => {
  for (const retryAfter of [undefined, 'invalid']) {
    const queue = [response(429, retryAfter), response(200)];
    const waits = [];
    assert.equal((await loginWithBackoff(async () => queue.shift(), { sleep: async ms => waits.push(ms) })).status, 200);
    assert.deepEqual(waits, [60000]);
  }
});

test('CI-login-04: credential and server errors are returned immediately without retries', async () => {
  for (const status of [401, 403, 500, 503]) {
    let attempts = 0;
    const waits = [];
    const failed = response(status);
    const result = await loginWithBackoff(async () => { attempts++; return failed; }, { sleep: async ms => waits.push(ms) });
    assert.equal(result, failed);
    assert.equal(attempts, 1);
    assert.deepEqual(waits, []);
  }
});

test('CI-login-05: network errors propagate and are never hidden by setup retries', async () => {
  let attempts = 0;
  const waits = [];
  const unavailable = new Error('Fixture network unavailable');
  await assert.rejects(loginWithBackoff(async () => { attempts++; throw unavailable; }, { sleep: async ms => waits.push(ms) }), error => error === unavailable);
  assert.equal(attempts, 1);
  assert.deepEqual(waits, []);
});
