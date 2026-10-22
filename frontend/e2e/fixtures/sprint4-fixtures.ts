import {expect,type APIRequestContext,type Page,type TestInfo} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mutation as baseMutation,test as baseTest} from './helpers'
import {reviewDatabase} from './venue-fixtures'
export {reviewDatabase}
function sourceState(){return {sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim())}}
const httpAudits=new WeakMap<TestInfo,Array<Record<string,unknown>>>()
function observeHttp(method:string,path:string,status:number,body:any){
 if(!/^\/(api\/(bookings|safety|events|venues|attendances)|internal\/(events|notification-context))\b/.test(path))return
 const info=baseTest.info(),rows=httpAudits.get(info)||[],error=body?.error||body?.data?.error||body?.data?.data?.error
 rows.push({method,path,status,errorCode:typeof error?.code==='string'?error.code:undefined,resourceId:body?.id||body?.booking?.id||body?.eventId,version:body?.version,effectiveStatus:body?.effectiveStatus||typeof body?.status==='string'&&body.status||undefined})
 httpAudits.set(info,rows)
}
export const test=baseTest.extend<{sprint4HttpAudit:void}>({
 sprint4HttpAudit:[async({},use,info)=>{try{await use()}finally{const responses=httpAudits.get(info)||[];if(responses.length)await info.attach('actual-domain-http-responses',{body:Buffer.from(JSON.stringify({testTitle:info.title,capturedAt:new Date().toISOString(),source:sourceState(),responses},null,2)),contentType:'application/json'});httpAudits.delete(info)}},{auto:true}],
})
export async function mutation(...args:Parameters<typeof baseMutation>){
 const response=await baseMutation(...args)
 observeHttp(args[1],args[2],response.status(),await response.json().catch(()=>null))
 return response
}
export function internalRequest(service:'booking'|'attendance',path:string,body?:unknown){
 const compose=process.env.CSE2E_COMPOSE_FILE
 if(!compose)throw Error('Disposable review stack required')
 const script="(async()=>{const r=await fetch('http://127.0.0.1:3000'+process.argv[1],{method:process.argv[2],headers:{'content-type':'application/json','x-internal-api-key':process.env.INTERNAL_API_KEY},...(process.argv[2]==='POST'?{body:process.argv[3]}:{})});console.log(JSON.stringify({status:r.status,body:await r.json()}))})().catch(e=>{console.error(e.message);process.exit(1)})"
 const result=JSON.parse(execFileSync('docker',['compose','-f',compose,'exec','-T',service+'-service','node','-e',script,path,body===undefined?'GET':'POST',JSON.stringify(body??null)],{encoding:'utf8'}));observeHttp(body===undefined?'GET':'POST',path,result.status,result.body);return result
}
export async function value(response:any,status=200){const body=await response.json();expect(response.status(),JSON.stringify(body)).toBe(status);return body}
export async function summary(actor:APIRequestContext,id:string){return value(await actor.get(`/api/bookings/events/${id}/summary`))}
export async function current(actor:APIRequestContext,id:string){return value(await actor.get(`/api/bookings/${id}`))}
export async function approve(staff:APIRequestContext,room:any,status='CONFIRMED'){
 return value(await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:room.version,originalVersion:room.originalBookingVersion,status,reason:status==='CONFIRMED'?'Staff checked suitability and occupied interval':'Venue cannot meet this request'}))
}
export async function reviewedBody(actor:APIRequestContext,room:any,action:string,body:any){
 if(room.status!=='CONFIRMED')return body
 const s=await summary(actor,room.eventId)
 const r=await value(await mutation(actor,'POST',`/api/safety/events/${room.eventId}/venue-change-reviews`,{version:s.event.version,bookingId:room.id,bookingVersion:room.version,action,reason:body.reason,proposed:body}))
 return {...body,changeReviewId:r.reviewId}
}
export async function cancel(actor:APIRequestContext,room:any,extra:any={},key=randomUUID()){
 const body=await reviewedBody(actor,room,'CANCEL',{...room,status:'CANCELLED',reason:'Release this room only',...extra})
 return {body,key,response:await mutation(actor,'PUT',`/api/bookings/${room.id}`,body,key)}
}
export function blockBody(room:any,extra:any={}){return {venueId:room.venueId,eventId:null,title:'Operational unavailability',reason:'Record the operational issue',startAt:room.occupiedStart,endAt:room.occupiedEnd,timeZone:room.timeZone,status:'UNAVAILABLE',unavailabilityCategory:'EQUIPMENT_FAILURE',unavailabilityNote:'Private operational investigation detail',...extra}}
export async function block(staff:APIRequestContext,room:any,extra:any={},key=randomUUID()){
 const body=blockBody(room,extra),preview=await value(await mutation(staff,'POST','/api/bookings/impact-preview',body))
 const input={...body,confirmImpact:true,impactFingerprint:preview.impactFingerprint}
 const saved=await value(await mutation(staff,'POST','/api/bookings',input,key))
 return {saved,preview,input,key}
}
export async function releaseBlock(staff:APIRequestContext,closure:any){return value(await mutation(staff,'PUT',`/api/bookings/${closure.id}`,{...closure,status:'CANCELLED',reason:'Operational work completed'}))}
export async function replace(actor:APIRequestContext,source:any,venue:any,extra:any={}){
 const input={...source,venueId:venue.id,status:'TENTATIVELY_HELD',reason:'Request a suitable replacement',expiresAt:undefined,...extra}
 const body=await reviewedBody(actor,source,'REPLACEMENT',input)
 return value(await mutation(actor,'POST',`/api/bookings/${source.id}/replacements`,body))
}
export async function safeConfirm(actor:APIRequestContext,officer:APIRequestContext,eventId:string,requestId:string){
 let s=await value(await actor.get(`/api/safety/events/${eventId}`))
 if(s.technical.status==='UNVERIFIED'||s.technical.status==='NOT_SUBMITTED')await value(await mutation(actor,'POST',`/api/events/${requestId}/technical-request`,{version:1,equipment:[],supportRequired:false,notRequired:true,placementDetails:'No equipment or technical support required'}))
 s=await value(await actor.get(`/api/safety/events/${eventId}`))
 if(s.round&&['STALE','CHANGES_REQUIRED'].includes(s.state)){
  await value(await mutation(actor,'POST',`/api/safety/events/${eventId}/rework-review`,{version:s.event.version,roundId:s.round.id,requirementsRevision:s.round.requirementsRevision,bookingIds:[],note:'Coordinator reviewed the effective venue change and retained unaffected arrangements'}))
  s=await value(await actor.get(`/api/safety/events/${eventId}`))
 }
 expect(s.canSubmit,JSON.stringify(s.outstanding)).toBe(true)
 await value(await mutation(actor,'POST',`/api/safety/events/${eventId}/submit`,{version:s.event.version}))
 s=await value(await actor.get(`/api/safety/events/${eventId}`))
 await value(await mutation(officer,'POST',`/api/safety/rounds/${s.round.id}/decision`,{roundId:s.round.id,round:s.round.number,requirementsRevision:s.round.requirementsRevision,decision:'APPROVE',reason:'All seven Safety factors reviewed for the current effective arrangement',areas:[],checklist:{attendance:true,layout:true,emergencyAccess:true,accessibility:true,equipmentPlacement:true,crowdMovement:true,restrictions:true},privateNotes:'Private review detail'}))
 s=await value(await actor.get(`/api/safety/events/${eventId}`))
 return value(await mutation(actor,'POST',`/api/safety/events/${eventId}/confirm`,{version:s.event.version}))
}
export async function registrations(eventId:string,count:number,room:any){
 await reviewDatabase('attendance',async db=>{
  await db.query('INSERT INTO events(id,"eventId",title,description,status,"startAt","endAt","timeZone","updatedAt") VALUES($1,$1,$2,$2,\'CONFIRMED\',$3,$4,$5,now()) ON CONFLICT ("eventId") DO NOTHING',[eventId,'Registration preservation precondition',room.startAt,room.endAt,room.timeZone])
  for(let i=0;i<count;i++)await db.query('INSERT INTO registrations(id,"eventId","userId",status,"registeredAt") VALUES($1,$2,$3,\'CONFIRMED\',now())',[randomUUID(),eventId,i===0?'a1000000-0000-4000-8000-000000000013':`review-attendee-${eventId}-${i}`])
 })
}
export async function evidence(page:Page,info:TestInfo,id:string,eventId:string,extra:Array<{database:string;query:string;rows:any[]}> = []){
 const query='SELECT id,status,CASE WHEN status=\'TENTATIVELY_HELD\' AND "expiresAt"<=clock_timestamp() THEN \'EXPIRED\' ELSE status::text END AS "effectiveStatus",version,flags,"originalBookingId","resubmittedFromId" FROM venue_booking_requests WHERE "eventId"=$1 ORDER BY "createdAt",id'
 const rows=(await reviewDatabase('booking',async db=>db.query(query,[eventId]))).rows
 const intervalQuery='SELECT id,"venueId","requestedStart" AS "startAt","requestedEnd" AS "endAt","occupiedStart","occupiedEnd","expiresAt" FROM venue_booking_requests WHERE "eventId"=$1 ORDER BY "createdAt",id'
 const intervals=(await reviewDatabase('booking',async db=>db.query(intervalQuery,[eventId]))).rows
 const outbox='SELECT kind,count(*)::int AS count FROM booking_outbox WHERE payload->>\'eventId\'=$1 AND kind NOT IN (\'VenueRequested\',\'VenueBookingApproved\',\'VenueBookingRejected\') GROUP BY kind ORDER BY kind'
 const intents=(await reviewDatabase('booking',async db=>db.query(outbox,[eventId]))).rows
 const inbox='SELECT type,"recipientId",count(*)::int AS count FROM notifications WHERE "eventId"=$1 AND type IN (\'BOOKING_CANCELLED\',\'BOOKING_CHANGED\',\'BOOKING_RESTORED\',\'VENUE_UNAVAILABLE\',\'VENUE_CHANGE_NEEDED\',\'VENUE_REPLACEMENT_APPROVED\',\'HOLD_EXPIRING\',\'HOLD_EXPIRED\',\'HOLD_EXTENDED\',\'VENUE_CHANGED\',\'BUFFER_CONFLICT\') GROUP BY type,"recipientId" ORDER BY type,"recipientId"'
 const notices=(await reviewDatabase('notification',async db=>db.query(inbox,[eventId]))).rows
 const history='SELECT action,count(*)::int AS count FROM activity_log WHERE details->>\'eventId\'=$1 AND action NOT IN (\'VenueRequested\',\'VenueBookingApproved\',\'VenueBookingRejected\') GROUP BY action ORDER BY action'
 const actions=(await reviewDatabase('event',async db=>db.query(history,[eventId]))).rows
 const results=[{database:'booking_db',query,rows},{database:'booking_db',query:outbox,rows:intents},{database:'notification_db',query:inbox,rows:notices},{database:'event_db',query:history,rows:actions},...extra]
 const source=sourceState()
 const capturedAt=new Date().toISOString(),raw=JSON.stringify({caseIds:id,eventId,capturedAt,source,results:[...results,{database:'booking_db',query:intervalQuery,rows:intervals}]},null,2)
 await info.attach(id+'-database-results',{body:Buffer.from(raw),contentType:'application/json'})
 const escape=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 const overview=[]
 for(const result of results){
  if(result.rows.length<=8||!(result.database==='notification_db'||result.database==='booking_db'&&result.query.includes('FROM venue_booking_requests'))){overview.push(result);continue}
  // Query a compact summary for the image; retain every original row in the attachment.
  const service=result.database.replace('_db','') as 'booking'|'notification'
  const aggregate=service==='booking'?'SELECT status,flags,count(*)::int AS count FROM venue_booking_requests WHERE "eventId"=$1 GROUP BY status,flags ORDER BY status':'SELECT type,count(*)::int AS count,count(DISTINCT "recipientId")::int AS recipients FROM notifications WHERE "eventId"=$1 GROUP BY type ORDER BY type'
  overview.push({database:result.database,query:aggregate,rows:(await reviewDatabase(service,async db=>db.query(aggregate,[eventId]))).rows})
 }
 await info.attach(id+'-query-overview',{body:Buffer.from(JSON.stringify({caseIds:id,eventId,capturedAt,source,results:overview},null,2)),contentType:'application/json'})
 const table=(rows:any[])=>{if(!rows.length)return '<p class="empty">No rows</p>';const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];return `<table><thead><tr>${keys.map(key=>`<th>${escape(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${keys.map(key=>`<td>${escape(typeof row[key]==='string'?row[key]:JSON.stringify(row[key])??'null')}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
 await page.setContent(`<html><head><title>${escape(id)} query results</title><style>body{font:14px system-ui;margin:24px;color:#16243a}h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;margin:14px 0 4px}small{display:block;font-size:11px;margin-bottom:5px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:6px;border:1px solid #c8d2e0;overflow-wrap:anywhere}th{background:#e6edf6}td{background:#f7f9fc}.empty{padding:8px;margin:0;background:#f1f4f8}</style></head><body><h1>${escape(id)} — actual PostgreSQL results</h1><small>Event ${eventId}. Captured ${capturedAt}. Synthetic fixture. Source ${source.sha}${source.dirty?' with uncommitted changes':''}.</small>${overview.map(r=>`<h2>${r.database}</h2><small>${escape(r.query)}</small>${table(r.rows)}`).join('')}</body></html>`)
 await page.screenshot({path:info.outputPath(id+'-postgresql.png'),fullPage:true})
 const shownIntervals=intervals.length<=8?intervals:(await reviewDatabase('booking',async db=>db.query(intervalQuery.replace('ORDER BY "createdAt",id','ORDER BY "createdAt" DESC,id DESC LIMIT 3'),[eventId]))).rows
 await page.setContent(`<html><head><title>${escape(id)} occupied intervals</title><style>body{font:14px system-ui;margin:24px;color:#16243a}h1{font-size:20px}small{display:block;font-size:11px;margin-bottom:10px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}th,td{text-align:left;padding:8px;border:1px solid #c8d2e0;overflow-wrap:anywhere}th{background:#e6edf6}td{background:#f7f9fc}</style></head><body><h1>${escape(id)} — actual occupied intervals${intervals.length>8?' (latest three; all rows in raw attachment)':''}</h1><small>Event ${eventId}. Captured ${capturedAt}. Source ${source.sha}${source.dirty?' with uncommitted changes':''}. ${escape(intervalQuery)}${intervals.length>8?' — image uses ORDER BY createdAt DESC LIMIT 3':''}</small>${table(shownIntervals)}</body></html>`)
 await page.screenshot({path:info.outputPath(id+'-intervals.png'),fullPage:true})
}
