import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = resolve(root, 'frontend')
const evidence = process.env.CSE2E_EVIDENCE_DIR || resolve(frontend, 'test-results/e2e')
mkdirSync(evidence, { recursive: true })
const source = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' }),
  diffSha256: createHash('sha256').update(execFileSync('git', ['diff', 'HEAD', '--binary'], { cwd: root })).digest('hex'),
  node: process.version,
  startedAt: new Date().toISOString(),
}
writeFileSync(resolve(evidence, 'source.json'), JSON.stringify(source, null, 2) + '\n')
const run = spawnSync(process.execPath, [resolve(frontend, 'node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], { cwd: frontend, stdio: 'inherit', env: { ...process.env, CSE2E_EVIDENCE_DIR: evidence } })
const record = spawnSync(process.execPath, [resolve(root, 'tests/scripts/record-browser-results.mjs'), resolve(evidence, 'results.json')], { cwd: root, stdio: 'inherit' })
process.exitCode = run.status === 0 ? (record.status === 0 ? 0 : record.status || 1) : run.status || 1
