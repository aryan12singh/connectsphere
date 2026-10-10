// Run Vitest with a machine-readable report without writing execution records into the repository.
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const json=process.env.TEST_RESULTS_JSON||join(tmpdir(),`connectsphere-vitest-${Date.now()}.json`)
const test=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--reporter=json','--outputFile='+json,...process.argv.slice(2)],{stdio:'inherit'})
process.exit(test.status??1)
