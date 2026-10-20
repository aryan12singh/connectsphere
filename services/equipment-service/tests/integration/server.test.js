const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('service server starts on an ephemeral port and shuts down cleanly', async t => {
  const serverPath = path.resolve(__dirname, '../../src/server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATA_MODE: 'memory', NODE_ENV: 'test', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(async () => {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
  });
  await new Promise((resolve, reject) => {
    const inspect = () => {
      if (output.includes('equipment-service listening on port')) return resolve();
      if (child.exitCode !== null) return reject(new Error(`server exited before startup: ${output}`));
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', reject);
    child.once('exit', inspect);
  });
  assert.match(output, /equipment-service listening on port \d+/);
  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(signal, null);
});
