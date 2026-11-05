const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const clock = require.resolve('../../tests/helpers/test-clock.cjs');
const probe = env => Number(execFileSync(process.execPath, ['--require', clock, '-e', 'process.stdout.write(String(Date.now()))'], { env: { ...process.env, ...env } }).toString());

test('test calendar pin: once the real date passes the pin, tests start at the pin and keep ticking', () => {
  const pinned = probe({ TEST_CLOCK_BASE: '2020-01-01T00:00:00.000Z', TEST_REAL_CLOCK: '' });
  assert.ok(pinned >= Date.parse('2020-01-01T00:00:00.000Z') && pinned < Date.parse('2020-01-01T00:01:00.000Z'), `pinned clock read ${new Date(pinned).toISOString()}`);
});

test('test calendar pin: before the pin date, and with TEST_REAL_CLOCK, the machine clock is used', () => {
  for (const env of [{ TEST_CLOCK_BASE: '2999-01-01T00:00:00.000Z', TEST_REAL_CLOCK: '' }, { TEST_CLOCK_BASE: '2020-01-01T00:00:00.000Z', TEST_REAL_CLOCK: '1' }]) {
    assert.ok(Math.abs(probe(env) - Date.now()) < 60_000);
  }
});
