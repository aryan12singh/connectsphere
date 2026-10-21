const test = require('node:test');
const assert = require('node:assert/strict');

test('service config provides stable defaults and reads explicit environment overrides', t => {
  const keys = ['PORT', 'DATA_MODE', 'DATABASE_URL', 'AUTH_SERVICE_URL', 'EVENT_SERVICE_URL', 'BOOKING_SERVICE_URL', 'INTERNAL_API_KEY', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const configPath = require.resolve('../../src/config');
  t.after(() => {
    for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
    delete require.cache[configPath];
  });
  for (const key of keys) delete process.env[key];
  delete require.cache[configPath];
  const defaults = require('../../src/config');
  assert.equal(defaults.port, 3000);
  assert.equal(defaults.dataMode, 'prisma');
  assert.equal(defaults.databaseUrl, '');
  assert.equal(defaults.internalApiKey, 'change-me-dev-internal-key');
  assert.equal(defaults.isTest, false);
  Object.assign(process.env, { PORT: '3131', DATA_MODE: 'memory', DATABASE_URL: 'postgresql://example', AUTH_SERVICE_URL: 'http://auth', EVENT_SERVICE_URL: 'http://events', BOOKING_SERVICE_URL: 'http://booking', INTERNAL_API_KEY: 'secret', NODE_ENV: 'test' });
  delete require.cache[configPath];
  const explicit = require('../../src/config');
  assert.deepEqual([explicit.port, explicit.dataMode, explicit.databaseUrl, explicit.authServiceUrl, explicit.eventServiceUrl, explicit.bookingServiceUrl, explicit.internalApiKey, explicit.isTest], [3131, 'memory', 'postgresql://example', 'http://auth', 'http://events', 'http://booking', 'secret', true]);
});
