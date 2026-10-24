import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const recorder = join(root, 'tests/scripts/record-browser-results.mjs')
const startTime = '2026-10-23T00:00:00.000Z'
const browser = (projectName, status = 'expected', result = 'passed') => ({ projectName, status, results: [{ status: result, duration: 12 }] })
const spec = (file, title = file, tests = [browser('desktop')]) => ({ file, title, tests })
const report = (specs, stats = {}) => ({ stats: { startTime, expected: specs.reduce((n, row) => n + row.tests.length, 0), unexpected: 0, flaky: 0, skipped: 0, ...stats }, suites: [{ specs }] })
function fixture(t, data) {
  const folder = mkdtempSync(join(tmpdir(), 'cs-browser-recorder-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const results = join(folder, 'results.json')
  writeFileSync(results, JSON.stringify(data))
  writeFileSync(join(folder, 'source.json'), JSON.stringify({ revision: 'fixture-revision' }))
  return { folder, results, run: () => spawnSync(process.execPath, [recorder, results], { encoding: 'utf8' }) }
}
function records(folder) {
  const base = join(folder, 'story-records')
  return existsSync(base) ? readdirSync(base).flatMap(story => readdirSync(join(base, story)).map(file => ({ story, file, text: readFileSync(join(base, story, file), 'utf8') }))) : []
}
function discoveredSpecs(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? discoveredSpecs(join(folder, entry.name)) : entry.name.endsWith('.spec.ts') ? [join(folder, entry.name)] : [])
}

test('preflight maps every discovered browser spec before production journeys begin', t => {
  const files = discoveredSpecs(join(root, 'frontend/e2e'))
  assert.ok(files.length > 0)
  const f = fixture(t, report(files.map(file => spec(file))))
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(records(f.folder).reduce((n, row) => n + (row.text.match(/\| PASS \|/g) || []).length, 0), files.length)
})

test('nested exact and explicit descriptive specs aggregate both projects into one story; legacy alias remains mapped', t => {
  const data = report([spec('frontend/e2e/CS-88.spec.ts', 'Existing case | details', [browser('desktop'), browser('mobile')])])
  data.suites[0].suites = [{ specs: [spec('CS-88-cancellation-intent.spec.ts', 'New cancellation component', [browser('desktop'), browser('mobile')]), spec('booking-regression.spec.ts')] }]
  data.stats.expected = 5
  const f = fixture(t, data), result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const rows = records(f.folder)
  assert.equal(rows.length, 2)
  const story = rows.find(row => row.story === 'CS-88')
  assert.equal((story.text.match(/\| PASS \|/g) || []).length, 4)
  assert.match(story.text, /Existing case \\\| details/)
  assert.match(story.text, /Source: fixture-revision/)
  assert.match(story.text, /Full run: 5 passed, 0 unexpected, 0 flaky, 0 skipped/)
  assert.match(result.stdout, /Recorded CS-88: 4\/4 browser cases/)
  assert.equal(rows.find(row => row.story === 'CS-35').text.includes('booking-regression.spec.ts'), true)
})

test('unmapped non-story and unapproved descriptive filenames fail before any dated record is written', t => {
  for (const file of ['unknown.spec.ts', 'CS88.spec.ts', 'CS-88-other.spec.ts']) {
    const f = fixture(t, report([spec('CS-88.spec.ts'), spec(file)])), result = f.run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /No story mapping for browser spec/)
    assert.deepEqual(records(f.folder), [])
  }
})

test('failed, flaky and skipped runs retain failed labels and actual terminal outcomes', t => {
  for (const [status, resultStatus, stats] of [
    ['unexpected', 'failed', { expected: 0, unexpected: 1 }],
    ['flaky', 'passed', { expected: 0, flaky: 1 }],
    ['skipped', 'skipped', { expected: 0, skipped: 1 }],
  ]) {
    const outcome = browser('mobile', status, resultStatus)
    if (status === 'flaky') outcome.results.unshift({ status: 'failed', duration: 4 })
    const f = fixture(t, report([spec('CS-88-cancellation-intent.spec.ts', 'Observed outcome', [outcome])], stats)), result = f.run()
    assert.equal(result.status, 0, result.stderr)
    const [record] = records(f.folder)
    assert.match(record.file, /GREEN-attempt-failed-BROWSER\.md$/)
    assert.match(record.text, new RegExp(`\\| ${resultStatus.toUpperCase()} \\| 12 \\| ${status === 'flaky' ? 1 : 0} \\|`))
    assert.doesNotMatch(record.text, /\| PASS \|/)
  }
})

test('dated evidence is immutable: exact replay and changed payload refuse without replacing original bytes', t => {
  const data = report([spec('CS-88-cancellation-intent.spec.ts')]), f = fixture(t, data)
  assert.equal(f.run().status, 0)
  const before = records(f.folder)
  assert.notEqual(f.run().status, 0)
  assert.deepEqual(records(f.folder), before)
  data.suites[0].specs[0].title = 'Changed payload'
  writeFileSync(f.results, JSON.stringify(data))
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Refusing to replace dated evidence/)
  assert.deepEqual(records(f.folder), before)
})
