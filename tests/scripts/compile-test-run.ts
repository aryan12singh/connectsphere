#!/usr/bin/env -S node --experimental-strip-types
/** IS212 yellow records from actual Vitest assertions, including failed runs. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)))
const requested=process.argv[2]??'all', jsonPath=process.argv[3]??'/tmp/vitest.json'
let phase=process.argv[4]??'execution'
if(!/^[\w-]+$/.test(phase))throw Error('Invalid run label')
const data=JSON.parse(readFileSync(jsonPath,'utf8'))
if(!data.success && phase==='GREEN')phase='GREEN-attempt-failed'
const instant=new Date(data.startTime??Date.now()),stamp=instant.toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z')
const date=instant.toISOString(), entries=new Map<string,{status:string,names:string[],actual:string}>()
for(const suite of data.testResults??[])for(const t of suite.assertionResults??[]){
 const id=t.title.match(/TC-CS\d+-\d+/)?.[0]??(t.ancestorTitles??[]).join(' ').match(/TC-CS\d+-\d+/)?.[0];if(!id)continue
 const status=t.status==='passed'?'Pass':t.status==='failed'?'Fail':t.status==='skipped'?'Blocked':'Not Executed'
 const actual=status==='Pass'?'Assertions passed; see scenario and layer limitations':(t.failureMessages?.[0]?.split('\n')[0]?.slice(0,240)??t.status)
 const previous=entries.get(id);const rank={Fail:4,Blocked:3,'Not Executed':2,Pass:1}
 entries.set(id,{status:previous && rank[previous.status]>rank[status]?previous.status:status,names:[...(previous?.names??[]),t.title],actual:previous && rank[previous.status]>rank[status]?previous.actual:actual})
}
const stories=requested==='all'?[...new Set([...entries.keys()].map(id=>id.match(/^TC-CS(\d+)/)![1]))].map(n=>'CS-'+n):[requested]
for(const story of stories){
 if(!/^CS-\d+$/.test(story))throw Error('Invalid story')
 const prefix='TC-'+story.replace('-','')+'-',cases=readFileSync(join(root,'tests/records',story,'test-cases.md'),'utf8')
 const ids=[...new Set([...cases.matchAll(new RegExp(prefix+'\\d+','g'))].map(m=>m[0]).concat([...entries.keys()].filter(id=>id.startsWith(prefix))))].sort()
 const rows=ids.map(id=>{const e=entries.get(id);return `| ${id} | ${(e?.actual??'No assertion executed').replaceAll('|','\\|')} | ${e?.status??'Not Executed'} | ${(e?.names.join('; ')??'').replaceAll('|','\\|')} | ${date} |`})
 const md=`# ${story} Test Execution — ${date}\n\nYellow section (IS212 / IEEE 829). Phase: ${phase}. Generated from actual ${data.runner??'Vitest JSON'}; missing cases remain Not Executed.\n\nSource: ${jsonPath}. Code revision/fingerprint: ${process.env.CS_VERIFY_REVISION??'see outside run metadata; early diagnostic not fingerprinted'} / ${process.env.CS_VERIFY_FINGERPRINT??'not supplied'}.\n\n${data.evidenceLayer??'Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.'}\n\n| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |\n|---|---|---|---|---|\n${rows.join('\n')}\n`
 const dir=join(root,'tests/records',story,'test-runs');mkdirSync(dir,{recursive:true});const out=join(dir,stamp+'-'+phase+'.md');writeFileSync(out,md);console.log('Wrote '+out)
}
