const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('CS-booking-INFRA-02: Prisma mode without a database URL fails at startup', () => {
  const result = spawnSync(process.execPath, ['-e', "try { require('./src/config'); process.stdout.write('ok'); } catch (error) { process.stderr.write(error.message); process.exit(1); }"], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATA_MODE: 'prisma', DATABASE_URL: '', NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL/);
});
