import { beforeAll,beforeEach,afterAll,afterEach,describe,expect,it,vi } from 'vitest'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),f=require('../helpers/venue-workflow.cjs'),clock=require('../../services/booking-service/src/clock')
let api:any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>f.reset())
afterEach(()=>vi.restoreAllMocks())
afterAll(async()=>{await api.close()})
describe('CS-36 — live venue search',()=>{
  it('TC-CS36-19 read projections use the deadline after a slow venue lookup, including calendar, search and Event summary',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const hold=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'read-clock'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'Read deadline check',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(hold.status).toBe(201)
    const date=vi.spyOn(clock,'now'),config=require('../../services/booking-service/src/config'),express=require('../../services/booking-service/node_modules/express'),{start}=require('../helpers/service-integration.cjs')
    const remoteApp=express();remoteApp.use(async(_req:any,res:any)=>{await new Promise(r=>setTimeout(r,20));date.mockReturnValue(new Date(hold.body.expiresAt));res.json(_req.path.endsWith('/catalogue')?{items:[v.body]}:v.body)})
    const remote=await start(remoteApp),old=config.venueServiceUrl;config.venueServiceUrl=remote.base
    try {
      date.mockReturnValue(new Date(Date.parse(hold.body.expiresAt)-1000))
      const availability=await api.booking.http(`/venue-bookings/availability?venueId=${v.body.id}`,{headers:f.coordinator})
      expect(availability.status).toBe(200);expect(availability.body.items).toEqual([])
      date.mockReturnValue(new Date(Date.parse(hold.body.expiresAt)-1000))
      const search=await api.booking.http(`/venue-bookings/events/${event.id}/venue-search?startAt=${encodeURIComponent(hold.body.startAt)}&endAt=${encodeURIComponent(hold.body.endAt)}`,{headers:f.coordinator})
      expect(search.status).toBe(200);expect(search.body.items.map((room:any)=>room.id)).toContain(v.body.id)
      date.mockReturnValue(new Date(Date.parse(hold.body.expiresAt)-1000))
      const summary=await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:f.coordinator})
      expect(summary.status).toBe(200);expect(summary.body.items[0].effectiveStatus).toBe('EXPIRED')
      expect(summary.body.checkedAt).toBe(hold.body.expiresAt);expect(f.bookings.getBooking(hold.body.id).status).toBe('TENTATIVELY_HELD')
    }finally{config.venueServiceUrl=old;await remote.close()}
  })
  it('TC-CS36-17 per-room filters cannot silently drop mandatory Event accessibility needs',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({accessibilityTags:[]})})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'cannot-drop'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'Drop required access attempt',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',accessibilityNeeds:[]}})
    expect(r.status).toBe(422);expect(r.body.error.fields.venueId).toContain('ACCESSIBILITY:WHEELCHAIR_ACCESS');expect(f.bookings.listBookings()).toEqual([])
  })
  it('TC-CS36-16 preserves the explicit no-accessibility-needs marker without inventing a required facility',async()=>{
    const {event}=await f.eventFixture({accessibilityNeeds:['NONE']}),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({accessibilityTags:[]})})
    expect(v.status).toBe(201)
    const search=await api.booking.http(`/venue-bookings/events/${event.id}/venue-search`,{headers:f.coordinator})
    expect(search.status).toBe(200);expect(search.body.items[0]).toMatchObject({id:v.body.id,match:'FULL',gaps:[]})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'none'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'No accessibility facilities requested',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201);expect(r.body.accessibilityNeeds).toEqual([]);expect(r.body.requirements.accessibilityNeeds).toEqual(['NONE'])
  })
  it('TC-CS36-15 respects the Event minimum capacity and venue type while a smaller breakout is independently assessed',async()=>{
    const {event}=await f.eventFixture({minimumCapacity:120}),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({capacity:100})})
    const wrong=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({capacity:150,venueType:'HYBRID'})})
    expect(v.status).toBe(201);expect(wrong.status).toBe(201)
    const path=`/venue-bookings/events/${event.id}/venue-search`
    expect((await api.booking.http(path,{headers:f.coordinator})).body.items).toEqual([])
    const breakout=await api.booking.http(path+'?expectedAttendance=40',{headers:f.coordinator})
    expect(breakout.status).toBe(200);expect(breakout.body.items.map((r:any)=>r.id)).toEqual([v.body.id])
  })
  it('TC-CS36-12 sorts full before partial and excludes inactive, small and occupied rooms without reserving',async()=>{
    const {event}=await f.eventFixture(),ids:any={}
    for(const [key,extra] of Object.entries({full:{name:'Zulu full'},partial:{name:'Alpha partial',facilities:[]},small:{capacity:79},inactive:{isActive:false},busy:{name:'Busy room'}}))ids[key]=(await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput(extra)})).body.id
    const hold=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'busy'},body:{eventId:event.id,venueId:ids.busy,title:'Booked room',reason:'Conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(hold.status).toBe(201)
    const path=`/venue-bookings/events/${event.id}/venue-search?startAt=2026-12-21T04%3A15%3A00.000Z&endAt=2026-12-21T06%3A00%3A00.000Z&facilities=PROJECTOR`
    const r=await api.booking.http(path,{headers:f.coordinator})
    expect(r.status).toBe(200);expect(r.body.items.map((v:any)=>v.id)).toEqual([ids.full,ids.partial])
    expect(r.body.items[0]).toMatchObject({match:'FULL',gaps:[],expectedAttendance:80,layout:'THEATRE',occupiedStart:'2026-12-21T03:45:00.000Z',occupiedEnd:'2026-12-21T06:30:00.000Z'})
    expect(r.body.items[1]).toMatchObject({match:'PARTIAL',gaps:['FACILITY:PROJECTOR'],canRequest:false})
    expect(f.bookings.listBookings()).toHaveLength(1)
  })
  it('TC-CS36-13 uses current assignment and refuses a search by another Coordinator',async()=>{
    const {event}=await f.eventFixture()
    expect((await api.booking.http(`/venue-bookings/events/${event.id}/venue-search`,{headers:{'x-test-user-id':'other','x-test-role':'EVENT_COORDINATOR'}})).status).toBe(403)
  })
  it('TC-CS36-09 expired holds stop occupying the calendar and search at the exact persisted deadline',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const created=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'expiry'},body:{eventId:event.id,venueId:v.body.id,title:'Private launch',reason:'Private notes',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(created.status).toBe(201)
    vi.spyOn(clock,'now').mockReturnValue(new Date(created.body.expiresAt))
    const r=await api.booking.http(`/venue-bookings/availability?venueId=${v.body.id}`,{headers:f.coordinator})
    expect(r.status).toBe(200);expect(r.body.items).toEqual([])
    const search=await api.booking.http(`/venue-bookings/events/${event.id}/venue-search?startAt=${encodeURIComponent(created.body.startAt)}&endAt=${encodeURIComponent(created.body.endAt)}`,{headers:f.coordinator})
    expect(search.status).toBe(200);expect(search.body.items.map((v:any)=>v.id)).toContain(v.body.id)
    expect(f.bookings.getBooking(created.body.id).status).toBe('TENTATIVELY_HELD')
    expect((await api.booking.http(`/venue-bookings/${created.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Too late'}})).status).toBe(409)
  })
  it('TC-CS36-14 exposes busy intervals without another customer’s title, notes or internal flags',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    expect((await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'privacy'},body:{eventId:event.id,venueId:v.body.id,title:'Private launch',reason:'Private notes',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})).status).toBe(201)
    const r=await api.booking.http(`/venue-bookings/availability?venueId=${v.body.id}`,{headers:{'x-test-user-id':'other','x-test-role':'EVENT_COORDINATOR'}})
    expect(r.status).toBe(200);expect(r.body.items).toHaveLength(1)
    expect(r.body.items[0].title).toBe('Occupied venue');expect(r.body.items[0]).not.toHaveProperty('reason');expect(r.body.items[0]).not.toHaveProperty('eventId');expect(r.body.items[0]).not.toHaveProperty('flags')
    expect(r.body.items[0]).toMatchObject({startAt:'2026-12-21T02:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z'})
  })
  it('TC-CS36-18 lets read-only support identify an operational closure without exposing staff notes or write access',async()=>{
    const v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const block=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.staff,'idempotency-key':'support-calendar'},body:{venueId:v.body.id,title:'Early Monday maintenance',reason:'Private staff notes',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',status:'BLOCKED'}})
    expect(block.status).toBe(201)
    const support={'x-test-user-id':'support','x-test-role':'TECHNICAL_SUPPORT_STAFF'}
    const r=await api.booking.http(`/venue-bookings/availability?venueId=${v.body.id}`,{headers:support})
    expect(r.status).toBe(200);expect(r.body.items).toHaveLength(1)
    expect(r.body.items[0]).toMatchObject({title:'Early Monday maintenance',status:'BLOCKED',occupiedStart:block.body.startAt,occupiedEnd:block.body.endAt})
    expect(r.body.items[0]).not.toHaveProperty('reason');expect(r.body.items[0]).not.toHaveProperty('statusChangedById')
    expect((await api.booking.http(`/venue-bookings/${block.body.id}`,{method:'PUT',headers:support,body:{...block.body,status:'CANCELLED',reason:'Forbidden edit'}})).status).toBe(403)
  })
})
