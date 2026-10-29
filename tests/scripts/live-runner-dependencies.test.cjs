const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/event-workflows.yml'), 'utf8');
const runner = readFileSync(resolve(root, 'scripts/run-event-review-ci.sh'), 'utf8');
const liveJob = workflow.match(/^  live:\n([\s\S]*?)(?=^  gate:)/m)?.[1];

test('live review CI installs host-run service dependencies and generates Attendance Prisma client', () => {
  assert.ok(liveJob, 'live job exists in the GitHub Actions workflow');

  const services = [...runner.matchAll(/npm run [^\n]*--prefix services\/([a-z0-9-]+)/g)]
    .map((match) => match[1]);

  assert.ok(services.length > 0, 'review runner has host-run service test commands');
  for (const service of new Set(services)) {
    assert.match(liveJob, new RegExp(`npm ci --prefix services/${service}(?:\\s|$)`), `${service} dependencies are installed on the host`);
    assert.ok(liveJob.includes(`services/${service}/package-lock.json`), `${service} lockfile participates in dependency caching`);
  }
  assert.match(liveJob, /cd services\/attendance-service && npx prisma generate/, 'Attendance Prisma client is generated for the host-run PostgreSQL suite');
});
