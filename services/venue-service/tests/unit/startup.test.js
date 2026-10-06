const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');

async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close');
    child.kill();
    await closed;
  }
}

function launch(port) {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(port), DATA_MODE: 'memory', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('CS-venue-INFRA-04: an occupied port fails startup instead of reporting a listening service', { timeout: 5000 }, async () => {
  const blocker = net.createServer();
  blocker.listen(0);
  await once(blocker, 'listening');
  const child = launch(blocker.address().port);
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const [code] = await once(child, 'close');
    assert.equal(code, 1);
    assert.match(stderr, /EADDRINUSE/);
    assert.doesNotMatch(stdout, /listening on port/);
  } finally {
    await stop(child);
    await new Promise(resolve => blocker.close(resolve));
  }
});

test('CS-venue-INFRA-05: port zero reports the actual listening port and serves its health endpoint', { timeout: 5000 }, async () => {
  const child = launch(0);
  let stdout = '';
  const port = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error('Service exited before readiness: ' + code)));
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const match = stdout.match(/venue-service listening on port (\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  try {
    const actualPort = await port;
    assert.ok(actualPort > 0);
    const response = await fetch('http://127.0.0.1:' + actualPort + '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'venue-service' });
  } finally { await stop(child); }
});
