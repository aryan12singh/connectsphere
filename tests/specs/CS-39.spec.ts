import { beforeAll, beforeEach, afterAll,afterEach,describe, expect, it,vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const f = require('../helpers/venue-workflow.cjs')
let api: any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>f.reset())
afterEach(()=>vi.restoreAllMocks())
afterAll(async()=>{await api.close()})
describe('CS-39 — server-side atomic commitment checks',()=>{
  it('TC-CS39-27 concurrent redeliveries with a changed assignment claim one message before inserting notices',async()=>{
    const store=require('../../services/notification-service/src/store');store.reset()
    const {deliver}=require('../../services/notification-service/src/deliver')
    const message={id:'ownership-race',type:'BookingDecided',payload:{decision:'REJECTED',reason:'Staff reason',eventId:'event-1',organiserId:'owner'}}
    let resolve:any;const barrier=new Promise(r=>{resolve=r});let calls=0
    const results=await Promise.all(['first-current','next-current'].map(coordinatorId=>deliver(message,{currentContext:async(m:any)=>{calls++;if(calls===2)resolve();await barrier;return {...m,payload:{...m.payload,coordinatorId}}}})))
    const inboxes=await Promise.all(['first-current','next-current'].map(x=>store.listFor(x)))
    expect(inboxes.reduce((count,inbox)=>count+inbox.items.length,0)).toBe(1)
    expect(results.filter(r=>r.result==='processed')).toHaveLength(1)
    expect(results.filter(r=>r.result==='duplicate')).toHaveLength(1)
  })

  it('TC-CS39-25 suppresses superseded assignment and booking-decision generations before inbox persistence',async()=>{
    const express=require('../../services/booking-service/node_modules/express'),source=express(),{start}=require('../helpers/service-integration.cjs')
    const cfg=require('../../services/notification-service/src/config'),old={eventServiceUrl:cfg.eventServiceUrl,bookingServiceUrl:cfg.bookingServiceUrl}
    source.get('/internal/events/event-1/planning-context',(_r:any,res:any)=>res.json({id:'event-1',eventRequestId:'request-1',organiserId:'owner',currentCoordinatorId:'c-current',title:'Current event',status:'ARRANGEMENT_PENDING'}))
    source.get('/internal/notification-context/booking-1',(_r:any,res:any)=>res.json({id:'booking-1',eventId:'event-1',venueId:'venue-1',status:'REJECTED',version:8,decisionVersion:7,expiresAt:null,flags:[]}))
    const api=await start(source);cfg.eventServiceUrl=api.base;cfg.bookingServiceUrl=api.base
    try{
      const {currentContext}=require('../../services/notification-service/src/currentContext')
      const base={id:'old-transition',aggregateId:'request-1',payload:{eventId:'event-1',eventRequestId:'request-1',coordinatorId:'c-old',fromCoordinatorId:'c-current'}}
      expect(await currentContext({...base,type:'CoordinatorReassigned'})).toBeNull()
      expect(await currentContext({...base,aggregateType:'VenueBooking',type:'BookingDecided',payload:{...base.payload,bookingId:'booking-1',venueId:'venue-1',decision:'REJECTED',version:3,reason:'Superseded reason'}})).toBeNull()
    }finally{Object.assign(cfg,old);await api.close()}
  })

  it('TC-CS39-24 rejects malformed array payloads before recording a delivery receipt',async()=>{
    const notifications=require('../../services/notification-service/src/store');notifications.reset()
    const {deliver}=require('../../services/notification-service/src/deliver')
    await expect(deliver({id:'invalid-array',type:'Unknown',payload:[]})).rejects.toMatchObject({status:422})
    expect(await notifications.getReceipt('invalid-array')).toBeNull()
  })

  it('TC-CS39-21 exposes current booking proof only to the internal notification consumer',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const hold=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'notice-proof'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Private staff context',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(hold.status).toBe(201)
    expect((await api.booking.http(`/internal/notification-context/${hold.body.id}`)).status).toBe(403)
    const proof=await api.booking.http(`/internal/notification-context/${hold.body.id}`,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}})
    expect(proof.status).toBe(200)
    expect(proof.body).toMatchObject({id:hold.body.id,eventId:event.id,venueId:v.body.id,status:'TENTATIVELY_HELD',version:1,expiresAt:hold.body.expiresAt,flags:[]})
    expect(proof.body).not.toHaveProperty('reason')
  })
  it('TC-CS39-22 resolves the current Coordinator before delivering an old queued decision and never leaks the staff reason to the Organiser',async()=>{
    const notifications=require('../../services/notification-service/src/store');notifications.reset()
    const {deliver}=require('../../services/notification-service/src/deliver')
    await deliver({id:'queued-reassignment',type:'BookingDecided',aggregateId:'booking-1',payload:{bookingId:'booking-1',eventId:'event-1',eventRequestId:'request-1',organiserId:'organiser',coordinatorId:'former',eventName:'Conference',decision:'REJECTED',reason:'Staff-only maintenance'}},{currentContext:async(m:any)=>({...m,payload:{...m.payload,coordinatorId:'current'}})})
    expect((await notifications.listFor('former')).items).toHaveLength(0)
    expect((await notifications.listFor('current')).items[0].text).toContain('Staff-only maintenance')
    expect((await notifications.listFor('organiser')).items[0].text).not.toContain('Staff-only maintenance')
  })

  it('TC-CS39-20 saves notification context with the real booking action so delivery never invents an owner or request ID',async()=>{
    const {event,request}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'notification-context'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Main room',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201)
    const intent=f.bookings.state.outbox.find((row:any)=>row.kind==='VenueRequested')
    expect(intent.payload).toMatchObject({bookingId:r.body.id,eventId:event.id,eventRequestId:request.id,organiserId:'organiser',coordinatorId:'coordinator',eventName:'Conference',venueName:'Bay Hall',version:1})
    expect(intent.payload.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const before=[f.bookings.state.bookings.size,f.bookings.state.outbox.length]
    const rejected=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'notification-conflict'},body:{eventId:event.id,venueId:v.body.id,title:'Conflicting',reason:'Must fail',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(rejected.status).toBe(409)
    expect([f.bookings.state.bookings.size,f.bookings.state.outbox.length]).toEqual(before)
  })
  it('TC-CS39-06 stale persisted conflict flags cannot keep an expired partner occupying the other hold',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),holds=[],at=Date.now()
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'expired-partner-'+i},body:{eventId:event.id,venueId:v.body.id,title:'Room '+i,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',expiresAt:new Date(at+(i+1)*3600000).toISOString()}})
      expect(r.status).toBe(201);holds.push(r.body)
    }
    // Explicit pre-rollout legacy snapshot, not a permitted user buffer edit.
    f.venues.state.venues.set(v.body.id,{...f.venues.getVenue(v.body.id),turnaroundMinutes:45,version:2})
    expect((await api.booking.http('/internal/venue-rechecks',{method:'POST',headers:{'x-internal-api-key':'change-me-dev-internal-key'},body:{venueId:v.body.id,version:2,actor:{id:'staff',role:'VENUE_STAFF'},reason:'Reset changed'}})).status).toBe(200)
    const current=f.bookings.getBooking(holds[1].id);expect(current.flags).toEqual(['BUFFER_CONFLICT'])
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date(holds[0].expiresAt))
    const result=await api.booking.http(`/venue-bookings/${current.id}/decision`,{method:'PUT',headers:f.staff,body:{version:current.version,status:'CONFIRMED',reason:'Expired partner no longer occupies'}})
    expect(result.status).toBe(200);expect(result.body.flags).toEqual([])
  })
  it('TC-CS39-11 an operational closure flags inherited holds without cancelling them and releasing it retains affected status until explicit Staff restoration',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()}),body={eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Main room',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
    const hold=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'operational-hold'},body})
    expect(hold.status).toBe(201)
    const preview=await api.booking.http('/venue-bookings/impact-preview',{method:'POST',headers:f.staff,body})
    const closed=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.staff,'idempotency-key':'closure'},body:{...body,eventId:null,status:'UNAVAILABLE',reason:'Emergency repair',confirmImpact:true,impactFingerprint:preview.body.impactFingerprint}})
    expect(closed.status).toBe(201);expect(f.bookings.getBooking(hold.body.id)).toMatchObject({status:'TENTATIVELY_HELD',flags:['AFFECTED_UNAVAILABLE','BUFFER_CONFLICT']})
    const released=await api.booking.http(`/venue-bookings/${closed.body.id}`,{method:'PUT',headers:f.staff,body:{...closed.body,status:'CANCELLED',reason:'Repair completed'}})
    expect(released.status).toBe(200);expect(f.bookings.getBooking(hold.body.id)).toMatchObject({status:'TENTATIVELY_HELD',flags:['AFFECTED_UNAVAILABLE']});const current=f.bookings.getBooking(hold.body.id);expect((await api.booking.http(`/venue-bookings/${current.id}/restore`,{method:'POST',headers:f.staff,body:{version:current.version,confirm:true,reason:'Staff verified the full interval'}})).status).toBe(200);expect(f.bookings.getBooking(current.id).flags).toEqual([])
  })
  it('TC-CS39-07 refuses a conflict acknowledgement or override at approval after a configuration change',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),holds=[]
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'override-'+i},body:{eventId:event.id,venueId:v.body.id,title:'Room '+i,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
      expect(r.status).toBe(201);holds.push(r.body)
    }
    expect((await api.booking.http(`/venue-bookings/${holds[0].id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Verified first room'}})).status).toBe(200)
    // Explicit pre-rollout legacy snapshot, not a permitted user buffer edit.
    f.venues.state.venues.set(v.body.id,{...f.venues.getVenue(v.body.id),turnaroundMinutes:45,version:2})
    const counts=[f.bookings.state.activities.length,f.bookings.state.outbox.length]
    const r=await api.booking.http(`/venue-bookings/${holds[1].id}/decision`,{method:'PUT',headers:f.staff,body:{version:f.bookings.getBooking(holds[1].id).version,status:'CONFIRMED',reason:'Acknowledged clash',override:true,acknowledge:true}})
    expect(r.status).toBe(409);expect(r.body.error.code).toBe('VENUE_CONFLICT');expect(f.bookings.getBooking(holds[1].id).status).toBe('TENTATIVELY_HELD');expect([f.bookings.state.activities.length,f.bookings.state.outbox.length]).toEqual(counts)
  })
  it('TC-CS39-10 a combined Coordinator/Staff role cannot directly create a confirmed booking or override a clash',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const express=require('../../services/booking-service/node_modules/express'),identity=express(),config=require('../../services/booking-service/src/config'),{start}=require('../helpers/service-integration.cjs')
    identity.post('/internal/sessions/validate',(_req:any,res:any)=>res.json({valid:true,user:{id:'coordinator',role:'EVENT_COORDINATOR',roles:['EVENT_COORDINATOR','VENUE_STAFF']},permissions:['venue_bookings.create','venue_bookings.decide','venues.view']}))
    const auth=await start(identity),old=config.authServiceUrl;config.authServiceUrl=auth.base
    try {
      const body={eventId:event.id,venueId:v.body.id,title:'Bypass attempt',reason:'Direct confirmation',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',status:'CONFIRMED'}
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{authorization:'Bearer combined-fixture','idempotency-key':'combined'},body})
      expect(r.status).toBe(403);expect(f.bookings.listBookings()).toEqual([]);expect(f.bookings.state.activities).toEqual([])
    } finally {config.authServiceUrl=old;await auth.close()}
  })
  it('TC-CS39-09 refuses competing occupied windows and leaves exactly one booking/history',async()=>{
    const {event}=await f.eventFixture()
    const v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const body={eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Main room',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
    const first=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'first'},body})
    expect(first.status).toBe(201)
    const second=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'second'},body:{...body,startAt:'2026-12-21T04:15:00.000Z',endAt:'2026-12-21T06:00:00.000Z'}})
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('VENUE_CONFLICT')
    expect(f.bookings.listBookings()).toHaveLength(1)
    expect(f.bookings.state.activities).toHaveLength(1)
  })
})

// Opt-in real infrastructure acceptance, run separately by the live CI job.
if(process.env.CS_BUS_ACCEPTANCE==='1') it('TC-CS39-23 a real booking action delivers a persisted staff notice through RabbitMQ',async()=>{
  const {bookingNotificationSmoke}=require('../helpers/notification-live.cjs')
  const evidence=await bookingNotificationSmoke()
  expect(evidence.messageId).toBeTruthy()
},90000)

if(process.env.CS_BUS_ACCEPTANCE==='1') it('TC-CS39-26 hold expiry produces an actual current Coordinator notice without releasing equipment',async()=>{
  const {bookingNotificationSmoke}=require('../helpers/notification-live.cjs')
  const proof=await bookingNotificationSmoke({exerciseExpiry:true})
  expect(proof.expiredNoticeId).toBeTruthy()
},90000)

it('TC-CS39-28 Safety submissions alert Officers and technical feedback reaches the relevant staff without private notes',async()=>{
  const {noticesFor,HANDLED}=require('../../services/notification-service/src/templates')
  expect(HANDLED).toContain('SafetySubmitted')
  const lookup={names:async()=>'',usersWithRole:async(role:string)=>[role+'-active']}
  const message={id:'round-notice',type:'SafetySubmitted',payload:{eventId:'event-1',roundId:'round-1',eventRequestId:'request-1',eventName:'Conference',organiserId:'owner',coordinatorId:'coord',privateNotes:'PRIVATE'}}
  const submitted=await noticesFor(message,lookup)
  expect(submitted).toContainEqual(expect.objectContaining({recipientId:'SAFETY_OFFICER-active',link:'/safety-checks/round-1'}))
  const changes=await noticesFor({...message,type:'SafetyChangesRequested',payload:{...message.payload,areas:['TECHNICAL'],comment:'Move cables safely'}},lookup)
  expect(changes).toContainEqual(expect.objectContaining({recipientId:'TECHNICAL_SUPPORT_STAFF-active'}))
  expect(JSON.stringify([...submitted,...changes])).not.toContain('PRIVATE')
})

it('TC-CS39-29 delayed same-round changes feedback survives Coordinator review and suppresses a superseded round',async()=>{
 const express=require('../../services/booking-service/node_modules/express'),app=express(),{start}=require('../helpers/service-integration.cjs'),config=require('../../services/notification-service/src/config'),old=config.eventServiceUrl
 let safetyRoundId='round-1'
 app.get('/internal/events/event-1/planning-context',(_req:any,res:any)=>res.json({id:'event-1',eventRequestId:'request-1',organiserId:'owner',currentCoordinatorId:'coord',title:'Conference',status:'ARRANGEMENT_PENDING',safetyState:'CHANGES_REQUIRED',safetyToken:null,safetyRoundId}))
 const source=await start(app);config.eventServiceUrl=source.base
 try{const {currentContext}=require('../../services/notification-service/src/currentContext'),message={id:'delayed-feedback',type:'SafetyChangesRequested',payload:{eventId:'event-1',eventRequestId:'request-1',roundId:'round-1'}};expect(await currentContext(message)).not.toBeNull();safetyRoundId='round-2';expect(await currentContext(message)).toBeNull()}
 finally{config.eventServiceUrl=old;await source.close()}
})

if(process.env.CS_BUS_FAULT_ACCEPTANCE==='1') it('TC-CS39-31 actual broker outage, producer restart, confirmed retry, duplicate replay, mandatory return and malformed dead letter',async()=>{
 const {faults}=require('../helpers/notification-faults.cjs')
 const result=await faults()
 expect(result.recoveredReceipt).toBe('PROCESSED')
 expect(result.replayedNotices).toBe(1)
 expect(result.malformedDeadLettered).toBe(true)
 expect(result.unroutableRejected).toBe(true)
},240000)
