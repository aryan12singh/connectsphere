// Isolated PostgreSQL HTTP tests; external-service fixtures are explicit in each suite.
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;
function requireTestDatabase(service) {
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/');
  assert.equal(url.pathname, `/${service}_test`, 'Integration tests require their own <service>_test database');
  process.env.NODE_ENV = 'test';
  process.env.DATA_MODE = 'prisma';
}
async function start(app) {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async http(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await nativeFetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
module.exports = { requireTestDatabase, start };
