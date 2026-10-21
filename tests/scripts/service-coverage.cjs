// c8's NODE_V8_COVERAGE is inherited by Node tests and HTTP-contract children.
// Run from the service directory; every src/**/*.js file stays in the report.
const { readdirSync, existsSync } = require('node:fs');
const { basename } = require('node:path');
const { spawnSync } = require('node:child_process');
const service = basename(process.cwd()).replace(/-service$/, '');
require('../helpers/service-integration.cjs').requireTestDatabase(service);
const env = { ...process.env, DATA_MODE: 'memory', NODE_ENV: 'test' };
const files = ['unit', 'integration'].flatMap(layer => readdirSync(`tests/${layer}`)
  .filter(file => file.endsWith('.test.js')).sort().map(file => `tests/${layer}/${file}`));
let failed = false;
for (const [command, args] of [
  [process.execPath, ['--test', '--test-concurrency=1', ...files]],
  ...(existsSync('tests/test_booking_contract.py') ? [['python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v']]] : []),
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
