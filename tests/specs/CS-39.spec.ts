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
  it('TC-CS39-06 stale persisted conflict flags cannot keep an expired partner occupying the other hold',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),holds=[],at=Date.now()
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'expired-partner-'+i},body:{eventId:event.id,venueId:v.body.id,title:'Room '+i,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',expiresAt:new Date(at+(i+1)*3600000).toISOString()}})
      expect(r.status).toBe(201);holds.push(r.body)
    }
    expect((await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({version:1,setupMinutes:0,turnaroundMinutes:45})})).status).toBe(200)
    expect((await api.booking.http('/internal/venue-rechecks',{method:'POST',headers:{'x-internal-api-key':'change-me-dev-internal-key'},body:{venueId:v.body.id,version:2,actor:{id:'staff',role:'VENUE_STAFF'},reason:'Reset changed'}})).status).toBe(200)
    const current=f.bookings.getBooking(holds[1].id);expect(current.flags).toEqual(['BUFFER_CONFLICT'])
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date(holds[0].expiresAt))
    const result=await api.booking.http(`/venue-bookings/${current.id}/decision`,{method:'PUT',headers:f.staff,body:{version:current.version,status:'CONFIRMED',reason:'Expired partner no longer occupies'}})
    expect(result.status).toBe(200);expect(result.body.flags).toEqual([])
  })
  it('TC-CS39-11 an operational closure flags inherited holds without cancelling them and releasing it clears the flags',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()}),body={eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Main room',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
    const hold=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'operational-hold'},body})
    expect(hold.status).toBe(201)
    const closed=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.staff,'idempotency-key':'closure'},body:{...body,eventId:null,status:'UNAVAILABLE',reason:'Emergency repair'}})
    expect(closed.status).toBe(201);expect(f.bookings.getBooking(hold.body.id)).toMatchObject({status:'TENTATIVELY_HELD',flags:['BUFFER_CONFLICT']})
    const released=await api.booking.http(`/venue-bookings/${closed.body.id}`,{method:'PUT',headers:f.staff,body:{...closed.body,status:'CANCELLED',reason:'Repair completed'}})
    expect(released.status).toBe(200);expect(f.bookings.getBooking(hold.body.id)).toMatchObject({status:'TENTATIVELY_HELD',flags:[]})
  })
  it('TC-CS39-07 refuses a conflict acknowledgement or override at approval after a configuration change',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),holds=[]
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'override-'+i},body:{eventId:event.id,venueId:v.body.id,title:'Room '+i,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
      expect(r.status).toBe(201);holds.push(r.body)
    }
    expect((await api.booking.http(`/venue-bookings/${holds[0].id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Verified first room'}})).status).toBe(200)
    expect((await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({version:1,setupMinutes:0,turnaroundMinutes:45})})).status).toBe(200)
    const counts=[f.bookings.state.activities.length,f.bookings.state.outbox.length]
    const r=await api.booking.http(`/venue-bookings/${holds[1].id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Acknowledged clash',override:true,acknowledge:true}})
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
