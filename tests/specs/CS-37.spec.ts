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
  it('TC-CS37-14 refuses an expired supplied deadline without any writes',async()=>{
    const x=await setup()
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'invalid-expiry'},body:{...x.body,expiresAt:'2026-01-01T00:00:00.000Z'}})
    expect(r.status).toBe(422)
    expect(r.body.error.fields.expiresAt).toEqual(expect.any(Array))
    expect(f.bookings.listBookings()).toEqual([])
  })
  it('TC-CS37-11 lets Venue Staff extend an active hold once with deadline history and a version guard',async()=>{
    const x=await setup()
    const created=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'extend'},body:x.body})
    expect(created.status).toBe(201)
    const path=`/venue-bookings/${created.body.id}/hold-extension`, expiresAt=new Date(Date.parse(created.body.expiresAt)+24*3600000).toISOString()
    const body={version:1,expiresAt,reason:'Customer needs another day'}
    expect((await api.booking.http(path,{method:'PUT',headers:f.coordinator,body})).status).toBe(403)
    const updated=await api.booking.http(path,{method:'PUT',headers:f.staff,body})
    expect(updated.status).toBe(200);expect(updated.body).toMatchObject({expiresAt,version:2,status:'TENTATIVELY_HELD'})
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body})).status).toBe(409)
    expect(f.bookings.state.activities).toHaveLength(2)
    expect(f.bookings.state.activities[1].changes.before.expiresAt).toBe(created.body.expiresAt)
    expect(f.bookings.state.activities[1].changes.after.expiresAt).toBe(expiresAt)
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
    const extended=await api.booking.http(`/venue-bookings/${r.body.id}/hold-extension`,{method:'PUT',headers:f.staff,body:{version:1,expiresAt,reason:'Approved extension'}})
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
