import {expect,type APIRequest,type APIRequestContext,type Page,type TestInfo} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {created,validRequest,assignedSession,mutation} from './helpers'
const require=createRequire(new URL('../../../services/event-service/package.json',import.meta.url))
const {Pool,types}=require('pg')
export async function planningEvent(request:APIRequest,owner:APIRequestContext,overrides:Record<string,unknown>={}) {
  const submitted=await created(owner,'submit',validRequest({expectedAttendance:80,minimumCapacity:80,accessibilityNeeds:[],venueRequirements:'Projector',...overrides}))
  const coordinator=await assignedSession(request,owner,submitted.id)
  try {
    const contact=await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
    const approved=await mutation(coordinator,'POST',`/api/events/${submitted.id}/decision`,{decision:'approve',version:submitted.version})
    expect(approved.status()).toBe(200)
    return {coordinator,contact,event:await approved.json()}
  } catch(error){await coordinator.dispose();throw error}
}
export async function createVenue(staff:APIRequestContext,overrides:Record<string,unknown>={}) {
  const response=await mutation(staff,'POST','/api/venues',{
    name:`Venue evidence ${randomUUID()}`,address:'Synthetic review venue',capacity:120,
    venueType:'PHYSICAL',supportedLayouts:['THEATRE','CLASSROOM'],facilities:['PROJECTOR'],accessibilityTags:[],timeZone:'Asia/Singapore',
    managedById:'a1000000-0000-4000-8000-000000000008',reason:'Isolated acceptance evidence',setupMinutes:30,turnaroundMinutes:45,
    operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'08:00',closesAt:'20:00'})),...overrides,
  })
  expect(response.status()).toBe(200);return response.json()
}
export const roomInput=(eventId:string,venueId:string,overrides:Record<string,unknown>={})=>({
  eventId,venueId,title:`Room evidence ${randomUUID()}`,reason:'Conference room',
  startAt:'2028-11-20T02:00:00.000Z',endAt:'2028-11-20T04:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,layout:'THEATRE',facilities:['PROJECTOR'],...overrides,
})
export async function hold(coordinator:APIRequestContext,eventId:string,venueId:string,overrides:Record<string,unknown>={}) {
  const response=await mutation(coordinator,'POST','/api/bookings',roomInput(eventId,venueId,overrides))
  expect(response.status()).toBe(200);return response.json()
}
export async function reviewDatabase<T>(service:'venue'|'booking'|'event'|'equipment'|'notification'|'attendance',work:(pool:any)=>Promise<T>):Promise<T> {
  const file=process.env.CSE2E_COMPOSE_FILE
  if(!file || !/^csreview-aryan-ci-[a-z0-9-]+$/.test(JSON.parse(readFileSync(file,'utf8')).name))throw Error('Only the current disposable review database may be used')
  const url=new URL(process.env.AUTH_DATABASE_URL ?? '')
  if(!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname!=='/auth_db')throw Error('Only loopback review databases are permitted')
  url.pathname=`/${service}_db`
  // Prisma stores these timezone-less SQL timestamps as UTC. The default pg
  // parser uses the host timezone, which would shift Mac evidence by eight hours.
  const pool=new Pool({connectionString:url.href,types:{getTypeParser:(oid:number,format?:string)=>
    oid===1114 && format!=='binary'?(value:string)=>new Date(`${value.replace(' ','T')}Z`):types.getTypeParser(oid,format),
  }})
  try{return await work(pool)}finally{await pool.end()}
}
export async function databaseEvidence(page:Page,info:TestInfo,caseId:string,results:Array<{database:string;query:string;rows:unknown[]}>) {
  const capturedAt=new Date().toISOString(),raw=JSON.stringify({caseId,capturedAt,results},null,2)
  await info.attach(`${caseId}-database-results`,{body:Buffer.from(raw),contentType:'application/json'})
  const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  await page.setContent(`<html><head><title>${caseId} PostgreSQL evidence</title><style>body{font:16px system-ui;margin:32px;color:#16243a}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:20px;background:#f1f4f8;border:1px solid #d5dce5;border-radius:12px}h1{font-size:24px}</style></head><body><h1>${caseId} — PostgreSQL query evidence</h1><p>Captured ${capturedAt}. Actual query results from this isolated production review stack. Synthetic test accounts and fixtures; no human or PO acceptance implied.</p><pre>${escape(raw)}</pre></body></html>`)
  await page.screenshot({path:info.outputPath(`${caseId}-postgresql.png`),fullPage:true})
}
