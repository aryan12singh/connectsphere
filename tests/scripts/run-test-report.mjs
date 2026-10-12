// Run Vitest with a machine-readable report without writing execution records into the repository.
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
const json=process.env.TEST_RESULTS_JSON||join(tmpdir(),`connectsphere-vitest-${Date.now()}.json`)
const test=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--reporter=json','--outputFile='+json,...process.argv.slice(2)],{stdio:'inherit'})
// Focused story evidence is opt-in; full-suite reports remain CI artifacts.
if(existsSync(json) && process.env.TEST_RECORD_STORIES){
 for(const story of process.env.TEST_RECORD_STORIES.split(',')){
  const report=spawnSync(process.execPath,['--experimental-strip-types','../tests/scripts/compile-test-run.ts',story,json,process.env.TEST_RUN_PHASE||'GREEN'],{stdio:'inherit'})
  if(report.status && !test.status)process.exit(report.status)
 }
}
process.exit(test.status??1)
