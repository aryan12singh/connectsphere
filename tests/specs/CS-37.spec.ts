import { beforeAll, beforeEach, afterAll, afterEach,describe, expect, it,vi } from 'vitest'
import { createRequire } from 'node:module'
import {mockNuxtImport,mountSuspended} from '@nuxt/test-utils/runtime'
mockNuxtImport('useFetch',()=>async(path:string)=>{const {ref}=await import('vue');return {data:ref(path.includes('availability')?{items:[{id:'expiry-ui',venueId:'venue',title:'Expiring room',status:'TENTATIVELY_HELD',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:'2026-12-21T00:00:01.000Z'}]}:{events:[]}),error:ref(null),refresh:vi.fn()}})
const require = createRequire(import.meta.url)
const f = require('../helpers/venue-workflow.cjs')
let api: any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>f.reset())
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
afterAll(async()=>{await api.close()})
async function setup(eventExtra: any = {}, venueExtra: any = {}) {
  const {event,request}=await f.eventFixture(eventExtra)
  const venue=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput(venueExtra)})
  return {event,request,venue:venue.body,body:{eventId:event.id,venueId:venue.body.id,title:'Main room',reason:'Customer conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',status:'TENTATIVELY_HELD'}}
}
describe('CS-37 — persisted, checked venue holds',()=>{
  it('TC-CS37-31 re-requesting a rejected room within 24 hours creates an immediate warning for its new hold',async()=>{
    const x=await setup(),created=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'rerequest-warning'},body:x.body})
    const rejected=await api.booking.http(`/venue-bookings/${created.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason:'Revise request'}});expect(rejected.status).toBe(200)
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date('2026-12-20T13:30:00.000Z'))
    const renewed=await api.booking.http(`/venue-bookings/${created.body.id}`,{method:'PUT',headers:f.coordinator,body:{...rejected.body,status:'TENTATIVELY_HELD',reason:'Revised arrangement'}})
    expect(renewed.status).toBe(200);expect(renewed.body.expiresAt).toBe('2026-12-21T01:30:00.000Z')
    const notices=f.bookings.state.outbox.filter((r:any)=>r.kind==='VenueHoldExpiring');expect(notices).toHaveLength(1);expect(notices[0].payload.version).toBe(renewed.body.version)
  })

  it('TC-CS37-30 an unassigned dual-role actor cannot overwrite the assigned Coordinator extension request',async()=>{
    const x=await setup(),r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'dual-extension'},body:x.body})
    const path=`/venue-bookings/${r.body.id}/hold-extension/request`,expiresAt=new Date(Date.parse(r.body.expiresAt)+3600000).toISOString()
    const requested=await api.booking.http(path,{method:'POST',headers:f.coordinator,body:{version:1,expiresAt,reason:'Valid request'}});expect(requested.status).toBe(200)
    const native=globalThis.fetch,spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>String(url).endsWith('/internal/sessions/validate')?new Response(JSON.stringify({valid:true,user:{id:'unassigned-dual',role:'EVENT_COORDINATOR',roles:['EVENT_COORDINATOR','VENUE_STAFF']},permissions:['venue_bookings.create','venue_bookings.decide','venues.view']}),{status:200,headers:{'content-type':'application/json'}}):native(url,options))
    try{
      const before=JSON.stringify(f.bookings.state)
      const denied=await api.booking.http(path,{method:'POST',headers:{authorization:'Bearer dual-role-fixture'},body:{version:2,expiresAt,reason:'Overwrite other Coordinator'}})
      expect(denied.status).toBe(403);expect(f.bookings.getBooking(r.body.id)).toEqual(requested.body);expect(JSON.stringify(f.bookings.state)).toBe(before)
    }finally{spy.mockRestore()}
  })

  it('TC-CS37-28 creates one immediate warning intent for a short hold and deduplicates request replay',async()=>{
    const x=await setup(),clock=require('../../services/booking-service/src/clock')
    vi.spyOn(clock,'now').mockReturnValue(new Date('2026-12-20T13:30:00.000Z'))
    const send=()=>api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'short-warning'},body:x.body})
    const r=await send();expect(r.status).toBe(201);expect(r.body.expiresAt).toBe('2026-12-21T01:30:00.000Z')
    expect((await send()).status).toBe(200)
    const warnings=f.bookings.state.outbox.filter((x:any)=>x.kind==='VenueHoldExpiring')
    expect(warnings).toHaveLength(1);expect(warnings[0].payload).toMatchObject({bookingId:r.body.id,coordinatorId:'coordinator',expiresAt:r.body.expiresAt})
  })

  it('TC-CS37-26 requires a current Coordinator request before Staff may approve a single bounded extension',async()=>{
    const x=await setup(),r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'policy-extension'},body:x.body})
    const path=`/venue-bookings/${r.body.id}/hold-extension`,expiresAt=new Date(Date.parse(r.body.expiresAt)+86400000).toISOString()
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:1,expiresAt,reason:'Unrequested extension'}})).status).toBe(409)
    const requested=await api.booking.http(path+'/request',{method:'POST',headers:f.coordinator,body:{version:1,expiresAt,reason:'Need one more day'}})
    expect(requested.status).toBe(200);expect(requested.body.expiresAt).toBe(r.body.expiresAt)
    expect(requested.body.extensionRequest).toMatchObject({requestedById:'coordinator',expiresAt,reason:'Need one more day'})
    const approved=await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:2,expiresAt,reason:'One extension approved'}})
    expect(approved.status).toBe(200);expect(approved.body).toMatchObject({version:3,expiresAt,extensionCount:1,extensionRequest:null})
    expect((await api.booking.http(path+'/request',{method:'POST',headers:f.coordinator,body:{version:3,expiresAt:new Date(Date.parse(expiresAt)+3600000).toISOString(),reason:'Another extension'}})).status).toBe(409)
    expect(f.bookings.state.outbox.filter((x:any)=>x.kind==='VenueHoldExtended')).toHaveLength(1)
  })
  it('TC-CS37-27 rejects excessive, expired, stale and unauthorized extension requests without changing the hold',async()=>{
    const x=await setup(),r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'policy-guards'},body:x.body}),path=`/venue-bookings/${r.body.id}/hold-extension/request`
    const body={version:1,expiresAt:new Date(Date.parse(r.body.expiresAt)+86400001).toISOString(),reason:'Too long'}
    expect((await api.booking.http(path,{method:'POST',headers:f.coordinator,body})).status).toBe(422)
    body.expiresAt=new Date(Date.parse(r.body.expiresAt)+3600000).toISOString()
    for(const headers of [f.staff,{'x-test-user-id':'other','x-test-role':'EVENT_COORDINATOR'}])expect((await api.booking.http(path,{method:'POST',headers,body})).status).toBe(403)
    expect((await api.booking.http(path,{method:'POST',headers:f.coordinator,body:{...body,version:2}})).status).toBe(409)
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date(r.body.expiresAt))
    expect((await api.booking.http(path,{method:'POST',headers:f.coordinator,body})).status).toBe(409)
    expect(f.bookings.getBooking(r.body.id)).toEqual(r.body)
  })

  it('TC-CS37-19 saves one durable request intent alongside the hold',async()=>{
    const x=await setup()
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'intent'},body:x.body})
    expect(r.status).toBe(201)
    expect(f.bookings.state.outbox ?? []).toHaveLength(1)
    expect(f.bookings.state.outbox[0]).toMatchObject({kind:'VenueRequested',aggregateId:r.body.id})
  })
  it('TC-CS37-10 creates an independently identified hold with a persisted future deadline and occupied window',async()=>{
    const x=await setup(),before=Date.now()
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'hold-1'},body:x.body})
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({eventId:x.event.id,expectedAttendance:80,layout:'THEATRE',version:1,occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',venueVersion:1})
    expect(Date.parse(r.body.expiresAt)).toBeGreaterThanOrEqual(before+72*3600000)
    expect(Date.parse(r.body.expiresAt)).toBeLessThanOrEqual(Date.now()+72*3600000)
    expect(f.bookings.getBooking(r.body.id).expiresAt).toBe(r.body.expiresAt)
    expect(f.bookings.state.outbox ?? []).toHaveLength(1)
    expect(f.bookings.state.outbox[0]).toMatchObject({kind:'VenueRequested',aggregateId:r.body.id})
  })
  it('TC-CS37-20 refuses an Event outside Planning without saving a hold',async()=>{
    const x=await setup({status:'CONFIRMED'})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'nonplanning'},body:x.body})
    expect(r.status).toBe(409)
    expect(f.bookings.listBookings()).toEqual([])
    expect(f.bookings.state.activities).toEqual([])
  })
  it('TC-CS37-14 derives an omitted deadline but refuses null, malformed or past supplied deadlines without writes',async()=>{
    const x=await setup()
    for(const expiresAt of [null,'not-a-deadline','2026-01-01T00:00:00.000Z','2026-12-21T02:00:00.000Z']){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'invalid-expiry-'+String(expiresAt)},body:{...x.body,expiresAt}})
      expect(r.status).toBe(422);expect(r.body.error.fields.expiresAt).toEqual(expect.any(Array));expect(f.bookings.listBookings()).toEqual([])
    }
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date('2026-12-20T13:30:00.000Z'))
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'derived-expiry'},body:x.body})
    expect(r.status).toBe(201);expect(r.body.expiresAt).toBe('2026-12-21T01:30:00.000Z')
  })
  it('TC-CS37-11 lets Venue Staff extend an active hold once with deadline history and a version guard',async()=>{
    const x=await setup()
    const created=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'extend'},body:x.body})
    expect(created.status).toBe(201)
    const path=`/venue-bookings/${created.body.id}/hold-extension`, expiresAt=new Date(Date.parse(created.body.expiresAt)+24*3600000).toISOString()
    const body={version:1,expiresAt,reason:'Customer needs another day'}
    expect((await api.booking.http(path,{method:'PUT',headers:f.coordinator,body})).status).toBe(403)
    const requested=await api.booking.http(path+'/request',{method:'POST',headers:f.coordinator,body});expect(requested.status).toBe(200)
    const updated=await api.booking.http(path,{method:'PUT',headers:f.staff,body:{...body,version:requested.body.version}})
    expect(updated.status).toBe(200);expect(updated.body).toMatchObject({expiresAt,version:3,status:'TENTATIVELY_HELD'})
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body})).status).toBe(409)
    expect(f.bookings.state.activities).toHaveLength(3)
    expect(f.bookings.state.activities[2].changes.before.expiresAt).toBe(created.body.expiresAt)
    expect(f.bookings.state.activities[2].changes.after.expiresAt).toBe(expiresAt)
  })
  it('TC-CS37-21 failed move preserves both rooms and a successful move releases only its old room',async()=>{
    const x=await setup(), rooms=[x.venue]
    for(let i=0;i<2;i++)rooms.push((await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({name:`Room ${i}`})})).body)
    const holds=[]
    for(let i=0;i<2;i++)holds.push((await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':`move-${i}`},body:{...x.body,venueId:rooms[i].id}})).body)
    const before=JSON.stringify(f.bookings.listBookings()),path=`/venue-bookings/${holds[0].id}`
    const failed=await api.booking.http(path,{method:'PUT',headers:f.coordinator,body:{...holds[0],venueId:rooms[1].id,reason:'Move main room'}})
    expect(failed.status).toBe(409);expect(JSON.stringify(f.bookings.listBookings())).toBe(before)
    const moved=await api.booking.http(path,{method:'PUT',headers:f.coordinator,body:{...holds[0],venueId:rooms[2].id,reason:'Move main room'}})
    expect(moved.status).toBe(200);expect(moved.body).toMatchObject({id:holds[0].id,venueId:rooms[2].id,version:2})
    expect(f.bookings.getBooking(holds[1].id)).toEqual(holds[1])
    expect(f.bookings.listBookings().filter((r:any)=>r.venueId===rooms[0].id)).toEqual([])
    expect((await api.booking.http(path,{method:'PUT',headers:f.coordinator,body:{...holds[0],venueId:rooms[2].id,reason:'Stale move'}})).status).toBe(409)
  })
  it('TC-CS37-33 a conflicting time edit preserves both original commitments and all business effects',async()=>{
    const x=await setup(),rows=[]
    for(const [key,startAt,endAt] of [['first','2026-12-21T02:00:00Z','2026-12-21T04:00:00Z'],['later','2026-12-21T07:00:00Z','2026-12-21T08:00:00Z']]){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':key},body:{...x.body,startAt,endAt}})
      expect(r.status).toBe(201);rows.push(r.body)
    }
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const r=await api.booking.http('/venue-bookings/'+rows[1].id,{method:'PUT',headers:f.coordinator,body:{...rows[1],startAt:'2026-12-21T03:00:00Z',endAt:'2026-12-21T05:00:00Z',reason:'Conflicting time edit'}})
    expect(r.status).toBe(409);expect(r.body.error.code).toBe('VENUE_CONFLICT')
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it('TC-CS37-22 rejects a setup window outside operating hours without any hold',async()=>{
    const x=await setup({}, {operatingHours:[{weekday:'MONDAY',isClosed:false,opensAt:'10:00',closesAt:'18:00'}]})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'hours'},body:x.body})
    expect(r.status).toBe(422);expect(r.body.error.fields.venueId).toContain('OUTSIDE_OPERATING_HOURS');expect(f.bookings.listBookings()).toEqual([])
  })
  it.each([{field:'facilities',value:null},{field:'facilities',value:'PROJECTOR'},{field:'accessibilityNeeds',value:{}},{field:'required',value:false},{field:'setupMinutes',value:0},{field:'startAt',value:'2026-12-21T02:00:00'}])('TC-CS37-23 rejects malformed or forbidden per-booking overrides: $field=$value',async({field,value})=>{
    const x=await setup()
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'bad-'+field},body:{...x.body,[field]:value}})
    expect(r.status).toBe(422);expect(r.body.error.fields[field]).toEqual(expect.any(Array));expect(f.bookings.listBookings()).toEqual([])
  })
  it('TC-CS37-24 keeps a Staff-approved extension when the Coordinator edits a title',async()=>{
    const x=await setup(),r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'extended-edit'},body:x.body})
    expect(r.status).toBe(201)
    const expiresAt=new Date(Date.parse(r.body.expiresAt)+3600000).toISOString()
    const requested=await api.booking.http(`/venue-bookings/${r.body.id}/hold-extension/request`,{method:'POST',headers:f.coordinator,body:{version:1,expiresAt,reason:'Request more time'}});expect(requested.status).toBe(200)
    const extended=await api.booking.http(`/venue-bookings/${r.body.id}/hold-extension`,{method:'PUT',headers:f.staff,body:{version:requested.body.version,expiresAt,reason:'Approved extension'}})
    expect(extended.status).toBe(200)
    const edited=await api.booking.http(`/venue-bookings/${r.body.id}`,{method:'PUT',headers:f.coordinator,body:{...extended.body,title:'Updated room label',reason:'Clarify label'}})
    expect(edited.status).toBe(200);expect(edited.body.expiresAt).toBe(expiresAt)
  })
  it.each([47,72,73])('TC-CS37-16 derives the default from the admission clock and caps it at setup (%sh gap)',async(gap)=>{
    const x=await setup(),clock=require('../../services/booking-service/src/clock'),occupied=Date.parse('2026-12-21T01:30:00.000Z'),at=new Date(occupied-gap*3600000)
    vi.spyOn(clock,'now').mockReturnValue(at)
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'cap-'+gap},body:x.body})
    expect(r.status).toBe(201);expect(Date.parse(r.body.expiresAt)).toBe(at.getTime()+Math.min(gap,72)*3600000)
    expect(r.body.createdAt).toBe(at.toISOString())
  })
  it('TC-CS37-25 an expired hold does not prevent venue deletion eligibility while its row/history stay intact',async()=>{
    const x=await setup(),created=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'link-expiry'},body:x.body})
    expect(created.status).toBe(201)
    vi.spyOn(require('../../services/booking-service/src/clock'),'now').mockReturnValue(new Date(created.body.expiresAt))
    const result=await api.booking.http('/internal/venue-links/'+x.venue.id,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}})
    expect(result.status).toBe(200);expect(result.body.blockingCount).toBe(0);expect(f.bookings.getBooking(created.body.id)).not.toBeNull();expect(f.bookings.state.activities).toHaveLength(1)
  })
  it('TC-CS37-26 the actual calendar removes a fetched hold at its deadline without waiting for a worker or navigation',async()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-12-21T00:00:00.000Z'))
    const component=(await import('../../frontend/app/components/venue/VenueCalendar.vue')).default
    const wrapper=await mountSuspended(component,{props:{venueId:'venue',venueName:'Bay Hall',timeZone:'Asia/Singapore',canCreate:false,canDecide:false}})
    try{expect(wrapper.text()).toContain('Expiring room');vi.setSystemTime(new Date('2026-12-21T00:00:01.000Z'));await new Promise(r=>setTimeout(r,1100));expect(wrapper.text()).not.toContain('Expiring room')}finally{wrapper.unmount()}
  })
})
