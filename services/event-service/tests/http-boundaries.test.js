const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
let server, base, prisma;

before(async () => {
  // Parser checks make no database or identity calls; use unreachable fixtures.
  process.env.AUTH_SERVICE_URL = process.env.USER_SERVICE_URL = 'http://127.0.0.1:9';
  process.env.INTERNAL_API_KEY = 'parser-fixture-only';
  process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:9/event_db';
  server = require('../src/app').listen(0, '127.0.0.1');
  prisma = require('../src/db');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
});
async function post(text) {
  const response = await fetch(base + '/event-requests', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: text,
  });
  return { status: response.status, body: await response.json() };
}

test('CS11 HTTP-01: exactly 10KB parses; one extra byte rejects before authentication or persistence', async () => {
  const empty = JSON.stringify({ purpose: '' });
  const atLimit = JSON.stringify({ purpose: 'x'.repeat(10 * 1024 - Buffer.byteLength(empty)) });
  assert.equal(Buffer.byteLength(atLimit), 10 * 1024);
  assert.equal((await post(atLimit)).status, 401, 'Accepted parser input still needs authentication');
  const oversized = await post(atLimit.replace('x', 'xx'));
  assert.equal(oversized.status, 413);
  assert.deepEqual(oversized.body, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be at most 10 KB.' } });
});

test('CS11 HTTP-02: malformed JSON returns a stable error without echoing private input', async () => {
  const result = await post('{"purpose":PRIVATE_INPUT_SENTINEL}');
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: { code: 'BAD_REQUEST', message: 'Use a valid JSON object.' } });
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE_INPUT_SENTINEL'));
});
