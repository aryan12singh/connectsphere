#!/usr/bin/env tsx
/**
 * Deterministically compiles the latest vitest JSON results for a story into
 * a single execution-record markdown per IS212 template (yellow section).
 *
 * Usage: npx vitest run --reporter=json --outputFile=/tmp/vitest.json && tsx tests/scripts/compile-test-run.ts CS-10
 * Or:    npm run test:report -- CS-10   (see frontend/package.json)
 *
 * Output: tests/records/<STORY>/test-runs/<YYYY-MM-DDTHH-mm-ss>.md   (date-time in title and Date of Execution)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const story = process.argv[2] ?? 'CS-10'
const jsonPath = process.argv[3] ?? '/tmp/vitest.json'
const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
const display = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

function loadResults(): Map<string, { status: string, actual: string }> {
  const map = new Map<string, { status: string, actual: string }>()
  try {
    const raw = readFileSync(jsonPath, 'utf-8')
    const data = JSON.parse(raw)
    // vitest json: { testResults: [{ name, assertionResults: [{ title, status, failureMessage }] }] }
    const results = data.testResults ?? data.testSuites ?? []
    for (const suite of results) {
      const cases: unknown[] = suite.assertionResults ?? suite.testResults ?? []
      for (const tc of cases as { title?: string, fullName?: string, ancestorTitles?: string[], status?: string, failureMessage?: string }[]) {
        const title: string = tc.title ?? tc.fullName ?? ''
        // Try to extract TC-CS10-XX from ancestor or title
        const tcId = (tc.ancestorTitles?.join(' ') + ' ' + title).match(/TC-CS10-\d+/)?.[0]
        if (!tcId) continue
        const status = tc.status === 'passed' ? 'Pass' : tc.status === 'failed' ? 'Fail' : tc.status ?? 'Blocked'
        const actual = status === 'Pass' ? 'As expected — see TC scenario' : (tc.failureMessage?.split('\n')[0]?.slice(0, 200) ?? 'Failed')
        map.set(tcId, { status, actual })
      }
    }
  }
  catch {
    // fallback: mark all as Pass if no json (deterministic demo)
  }
  return map
}

const tcOrder = ['TC-CS10-01', 'TC-CS10-02', 'TC-CS10-03', 'TC-CS10-04', 'TC-CS10-05', 'TC-CS10-06']
const results = loadResults()

let md = `# CS-10 Test Execution — ${display}\n\n`
md += `> Yellow section — one deterministic file per run (template per IS212 picture). Generated from vitest results.\n\n`
md += `| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |\n`
md += `|---|---|---|---|---|\n`
for (const tc of tcOrder) {
  const r = results.get(tc)
  const actual = r?.actual ?? 'Not Executed'
  const status = r?.status ?? 'Not Executed'
  md += `| ${tc} | ${actual.replaceAll('|', '\\|')} | ${status} |  | ${display} |\n`
}

function resolveOutDir(): string {
  const cwd = process.cwd()
  // When invoked from frontend/ (npm run test:report), parent holds the canonical tests/ records.
  if (existsSync(join(cwd, '..', 'tests', 'records'))) return join(cwd, '..', 'tests', 'records', story, 'test-runs')
  if (existsSync(join(cwd, 'tests', 'records'))) return join(cwd, 'tests', 'records', story, 'test-runs')
  return join(cwd, 'tests', 'records', story, 'test-runs')
}
const outDir = resolveOutDir()
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${stamp}.md`)
if (existsSync(outPath)) {
  // deterministic: overwrite same file if re-run same second
}
writeFileSync(outPath, md, 'utf-8')
console.log(`Wrote ${outPath}`)

// Also write a stable latest.md for CI (deterministic)
writeFileSync(join(outDir, 'latest.md'), md, 'utf-8')
