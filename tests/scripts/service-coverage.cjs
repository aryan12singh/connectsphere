// c8's NODE_V8_COVERAGE is inherited by Node tests and HTTP-contract children.
// Run from the service directory; every src/**/*.js file stays in the report.
const { readdirSync, existsSync } = require('node:fs');
const { basename } = require('node:path');
const { spawnSync } = require('node:child_process');
const service = basename(process.cwd()).replace(/-service$/, '');
require('../helpers/service-integration.cjs').requireTestDatabase(service);
const env = { ...process.env, DATA_MODE: 'memory', NODE_ENV: 'test' };
const layer = name => existsSync(`tests/${name}`) ? readdirSync(`tests/${name}`)
  .filter(file => file.endsWith('.test.js')).sort().map(file => `tests/${name}/${file}`) : [];
// Unit tests run on the pinned test calendar so literal fixture dates never go
// stale (tests/helpers/test-clock.cjs). Integration tests share PostgreSQL's
// real clock, so they keep the machine clock.
const testClock = require.resolve('../helpers/test-clock.cjs');
const unit = layer('unit'), integration = layer('integration');
let failed = false;
for (const [command, args] of [
  ...(unit.length ? [[process.execPath, ['--require', testClock, '--test', '--test-concurrency=1', ...unit]]] : []),
  ...(integration.length ? [[process.execPath, ['--test', '--test-concurrency=1', ...integration]]] : []),
  ...(existsSync('tests/test_booking_contract.py') ? [['python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v']]] : []),
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
