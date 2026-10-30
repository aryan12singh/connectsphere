const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restoreVenue, withStoppedVenue } = require('../../frontend/e2e/fixtures/venue-recovery.cjs');

test('waits until direct health and the gateway both recover after restart', async () => {
  const probes = [{ direct: 200, gateway: 503 }, { direct: 200, gateway: 401 }];
  let recreated = 0;
  await restoreVenue({ start: async () => {}, probe: async () => probes.shift(), recreate: async () => { recreated++; }, diagnose: async () => 'diagnostics', pause: async () => {}, attempts: 2 });
  assert.equal(recreated, 0);
  assert.equal(probes.length, 0);
});

test('reports the original readiness failure and attempts to recover the stack', async () => {
  let recreated = 0;
  let calls = 0;
  await assert.rejects(() => restoreVenue({ start: async () => {}, probe: async () => ++calls <= 2 ? { direct: 200, gateway: 503 } : { direct: 200, gateway: 401 }, recreate: async () => { recreated++; }, diagnose: async () => 'DNS unavailable', pause: async () => {}, attempts: 2 }), /DNS unavailable.*restored/s);
  assert.equal(recreated, 1);
});

test('preserves a fixture error if restoration also fails', async () => {
  await assert.rejects(() => withStoppedVenue({ stop: async () => {}, work: async () => { throw Error('fixture failed'); }, restore: async () => { throw Error('restart failed'); } }), error => {
    assert.match(error.message, /fixture failed/);
    assert.match(error.message, /restart failed/);
    return true;
  });
});

test('attempts restoration even when stopping the service fails', async () => {
  let restored = false;
  await assert.rejects(() => withStoppedVenue({ stop: async () => { throw Error('stop failed'); }, work: async () => { throw Error('work must not run'); }, restore: async () => { restored = true; } }), /stop failed/);
  assert.equal(restored, true);
});

test('reports a failed recovery without masking the original start error', async () => {
  await assert.rejects(() => restoreVenue({ start: async () => { throw Error('start failed'); }, probe: async () => ({ direct: 0, gateway: 503 }), recreate: async () => { throw Error('recreate failed'); }, diagnose: async () => 'container exited', pause: async () => {}, attempts: 1 }), /start failed.*container exited.*recreate failed/s);
});
