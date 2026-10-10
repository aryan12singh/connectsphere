import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'

const resultFile = resolve(process.argv[2] || 'frontend/test-results/e2e/results.json')
const report = JSON.parse(readFileSync(resultFile, 'utf8'))
const stamp = new Date(report.stats.startTime).toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-')
const success = report.stats.unexpected === 0 && report.stats.flaky === 0 && report.stats.skipped === 0 && report.stats.expected > 0
const phase = success ? 'GREEN' : 'GREEN-attempt-failed'
const cases = new Map()
function visit(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      const file = basename(spec.file)
      const story = file.match(/^(CS-\d+)\.spec\.ts$/)?.[1] || (file === 'booking-regression.spec.ts' ? 'CS-35' : null)
      if (!story) throw new Error(`No story mapping for browser spec ${file}`)
      for (const test of spec.tests) {
        const result = test.results.at(-1)
        const status = test.status === 'expected' && result?.status === 'passed' ? 'PASS' : result?.status?.toUpperCase() || 'NOT EXECUTED'
        const row = { name: spec.title, project: test.projectName, status, duration: result?.duration || 0, reruns: Math.max(0, test.results.length - 1) }
        cases.set(story, [...(cases.get(story) || []), row])
      }
    }
    visit(suite.suites || [])
  }
}
visit(report.suites)
const sourceFile = resolve(dirname(resultFile), 'source.json')
const source = existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, 'utf8')) : { note: 'Source captured by the external command runner; see the delivery run index.' }
function cell(value) { return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ') }
for (const [story, rows] of cases) {
  const text = `# ${story} — ${phase} browser execution\n\nStarted UTC: ${report.stats.startTime}\n\nRunner: Codex automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.\n\nSource: ${source.revision || source.note}\n\nFull run: ${report.stats.expected} passed, ${report.stats.unexpected} unexpected, ${report.stats.flaky} flaky, ${report.stats.skipped} skipped.\n\n| Browser case | Project | Result | Duration ms | Reruns |\n|---|---|---|---|---|\n${rows.map(row => `| ${cell(row.name)} | ${cell(row.project)} | ${row.status} | ${row.duration} | ${row.reruns} |`).join('\n')}\n\nMachine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/${story}/test-cases.md.\n`
  const targets = [resolve(dirname(resultFile), 'story-records', story)]
  for (const folder of targets) {
    mkdirSync(folder, { recursive: true })
    const path = resolve(folder, `${stamp}-${phase}-BROWSER.md`)
    if (existsSync(path)) throw new Error(`Refusing to replace dated evidence ${path}`)
    writeFileSync(path, text)
  }
  console.log(`Recorded ${story}: ${rows.filter(row => row.status === 'PASS').length}/${rows.length} browser cases`)
}
