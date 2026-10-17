// Negative controls use separate reports; production coverage evidence is retained.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = process.env.CS_COVERAGE_PROOF_DIR || mkdtempSync(join(tmpdir(), 'cs-coverage-proof-'))
mkdirSync(output, { recursive: true })
const fixture = join(output, 'subject.cjs')
const test = join(output, 'subject.test.cjs')
writeFileSync(fixture, `exports.choose = function (value) {
  if (value) {
    return 'yes'
  } else {
    return 'no'
  }
}
exports.unused = function () {
  return 'unused'
}
`)
writeFileSync(test, `const { test } = require('node:test')
const assert = require('node:assert/strict')
test('one branch passes while other production paths remain uncovered', () => {
  assert.equal(require('./subject.cjs').choose(true), 'yes')
})
`)

function nodeControl(metric, threshold, expectedStatus) {
  const log = join(output, `node-${metric}-${threshold}.log`)
  // Same Bash/pipefail + tee boundary used by the service jobs.
  const args = ['--experimental-test-coverage', `--test-coverage-include=${fixture}`,
    `--test-coverage-${metric}=${threshold}`, '--test', test]
  const run = spawnSync('bash', ['--noprofile', '--norc', '-o', 'pipefail', '-c',
    '"$@" 2>&1 | tee "$CS_PROOF_LOG"', '--', process.execPath, ...args], {
    cwd: root, env: { ...process.env, CS_PROOF_LOG: log }, encoding: 'utf8',
  })
  assert.ifError(run.error)
  assert.equal(run.signal, null, `Node ${metric} control was interrupted`)
  assert.equal(run.status, expectedStatus, `Node ${metric} control: ${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /# pass 1\b/)
  assert.match(run.stdout, /# fail 0\b/)
  assert.match(run.stdout, /# all files\s*\|/)
  if (expectedStatus === 1) {
    const label = metric === 'functions' ? 'function' : metric === 'branches' ? 'branch' : 'line'
    assert.match(run.stdout, new RegExp(`${label} coverage does not meet threshold`))
  }
}

nodeControl('lines', 1, 0)
for (const metric of ['lines', 'branches', 'functions']) nodeControl(metric, 100, 1)

// A real focused suite passes its assertions but must fail the normal global
// frontend floors. It cannot overwrite the full-suite coverage or test report.
const partialCoverage = join(output, 'frontend-partial-coverage')
const partialResults = join(output, 'frontend-partial-results.json')
const vitest = spawnSync(process.execPath, ['../tests/scripts/run-test-report.mjs',
  '--coverage', '../tests/specs/CS-78.spec.ts'], {
  cwd: join(root, 'frontend'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, TEST_RESULTS_JSON: partialResults, CS_COVERAGE_DIR: partialCoverage,
    TEST_RECORD_STORIES: '', TEST_EVIDENCE_LAYER: '' },
})
writeFileSync(join(output, 'frontend-partial.log'), (vitest.stdout || '') + (vitest.stderr || ''))
assert.ifError(vitest.error)
assert.equal(vitest.signal, null, 'Frontend coverage control was interrupted')
assert.equal(vitest.status, 1, 'A focused suite must not satisfy whole-frontend coverage')
const results = JSON.parse(readFileSync(partialResults, 'utf8'))
assert.ok(results.numPassedTests > 0, 'The focused tests must actually execute')
assert.equal(results.numFailedTests, 0, 'A broken assertion is not coverage-gate evidence')
assert.equal(results.numPendingTests, 0, 'A skipped suite is not coverage-gate evidence')
assert.equal(results.numFailedTestSuites, 0, 'A setup error is not coverage-gate evidence')
assert.equal(results.numPendingTestSuites, 0, 'A skipped suite is not coverage-gate evidence')
assert.match((vitest.stdout || '') + (vitest.stderr || ''), /Coverage for .* does not meet .*threshold/i)
const totals = JSON.parse(readFileSync(join(partialCoverage, 'coverage-summary.json'), 'utf8')).total
for (const name of ['lines', 'statements', 'branches', 'functions']) {
  assert.ok(totals[name].total > 0, `No ${name} denominator in the negative control`)
}

const summary = `# Coverage gate verification\n\nSource: ${process.env.CS_VERIFY_REVISION || 'local working tree'}\n\n` +
  `- Node positive control: 1 passing test, exit 0 through Bash/tee.\n` +
  `- Node line, branch and function controls: assertions pass; each 100% floor rejects with exit 1 through Bash/pipefail/tee.\n` +
  `- Frontend focused suite: ${results.numPassedTests} tests pass, none fail/skip; the normal global floors reject with exit 1 propagated by run-test-report.mjs.\n` +
  `- Full-suite test and coverage artifacts remain separate from these intentional negative controls.\n`
writeFileSync(join(output, 'coverage-gate-proof.md'), summary)
console.log(summary)
