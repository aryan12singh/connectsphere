const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function loadWith(env) {
  return spawnSync(process.execPath, ['-e', "try { require('./src/config'); process.stdout.write('ok'); } catch (error) { process.stderr.write(error.message); process.exit(1); }"], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('CS-venue-INFRA-02: Prisma mode without a database URL fails at startup', () => {
  const result = loadWith({ DATA_MODE: 'prisma', DATABASE_URL: '', NODE_ENV: 'production' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL/);
});

test('CS-venue-INFRA-03: invalid maximum capacity configuration fails at startup', () => {
  const result = loadWith({ DATA_MODE: 'memory', MAX_VENUE_CAPACITY: '0', NODE_ENV: 'test' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MAX_VENUE_CAPACITY/);
});
