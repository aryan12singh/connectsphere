const test = require('node:test');
const assert = require('node:assert/strict');

test('database adapter is omitted in memory mode and requires a URL in Prisma mode', t => {
  const saved = { dataMode: process.env.DATA_MODE, databaseUrl: process.env.DATABASE_URL };
  const config = require('../../src/config');
  const dbPath = require.resolve('../../src/db');
  t.after(() => {
    config.dataMode = saved.dataMode || 'memory';
    config.databaseUrl = saved.databaseUrl || '';
    delete require.cache[dbPath];
  });
  config.dataMode = 'memory';
  delete require.cache[dbPath];
  assert.equal(require('../../src/db'), null);
  config.dataMode = 'prisma';
  config.databaseUrl = '';
  delete require.cache[dbPath];
  assert.throws(() => require('../../src/db'), /Missing required environment variable: DATABASE_URL/);
  config.databaseUrl = 'postgresql://test:test@127.0.0.1:5432/connectsphere_test';
  delete require.cache[dbPath];
  const client = require('../../src/db');
  assert.equal(typeof client.$transaction, 'function');
  client.$disconnect();
});
