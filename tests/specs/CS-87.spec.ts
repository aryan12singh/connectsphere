import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mockNuxtImport,mountSuspended } from '@nuxt/test-utils/runtime'
import { bookingDraftForExisting,coordinatorBookingEditState } from '../../frontend/app/components/venue/booking-state'
mockNuxtImport('useUserSession',()=>()=>({loggedIn:{value:true},fetch:vi.fn(),user:{value:{id:'coordinator',role:'EVENT_COORDINATOR',permissions:['venue_bookings.create','venues.view','events.view']}}}))
mockNuxtImport('useRequestFetch',()=>()=>async()=>({items:[],nextCursor:null}))
mockNuxtImport('useFetch',()=>async(path:any)=>{
  const {ref}=await import('vue')
  const url=typeof path==='function'?path():String(path)
  const data=url.includes('/summary')?{event:{id:'event-ui',title:'Conference',status:'ARRANGEMENT_PENDING',currentCoordinatorId:'coordinator',startAt:'2026-12-21T01:00:00.000Z',endAt:'2026-12-21T10:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,preferredLayout:'THEATRE',accessibilityNeeds:[]},items:[],venueReady:false,outstanding:[{bookingId:null,reasons:['NO_VENUE_BOOKING']}]}:url.includes('/options')?{supportedLayouts:[{value:'THEATRE',label:'Theatre'}],facilities:[],accessibilityTags:[]}:{items:[],total:0}
  return {data:ref(data),error:ref(null),refresh:vi.fn()}
})
const require = createRequire(import.meta.url)
const fixture = require('../helpers/venue-workflow.cjs')
let api: any
beforeAll(async () => { api = await fixture.stack() })
beforeEach(() => fixture.reset())
afterAll(async () => { await api.close() })

describe('CS-87 — independent venue bookings', () => {
  it('TC-CS87-12 server-rendered room actions stay disabled until browser handlers attach',async()=>{
    const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer')
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default
    const html=await renderToString(createSSRApp(component,{eventId:'event-ui'}))
    const document=new DOMParser().parseFromString(html,'text/html')
    const add=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Add another venue'))
    const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Refresh arrangements'))
    expect(add?.hasAttribute('disabled')).toBe(true);expect(refresh?.hasAttribute('disabled')).toBe(true)
  })
  it('TC-CS87-11 bridges the existing request form labels and lowercase layout to venue catalogue codes without dropping unknown needs',async()=>{
    const {event}=await fixture.eventFixture({venueType:'physical',preferredLayout:'theatre',accessibilityNeeds:['Wheelchair accessible entrance & seating','Hearing loop / assisted listening','Accessible restrooms nearby']})
    const v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput({accessibilityTags:['WHEELCHAIR_ACCESS','HEARING_LOOP','ACCESSIBLE_RESTROOMS']})})
    const summary=await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:fixture.coordinator})
    expect(summary.status).toBe(200);expect(summary.body.event).toMatchObject({venueType:'PHYSICAL',preferredLayout:'THEATRE',accessibilityNeeds:['WHEELCHAIR_ACCESS','HEARING_LOOP','ACCESSIBLE_RESTROOMS']})
    const body={eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Real request form needs',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'form-labels'},body})
    expect(r.status).toBe(201);expect(r.body.layout).toBe('THEATRE')
    const other=await fixture.eventFixture({preferredLayout:'theatre',accessibilityNeeds:['Other accessibility needs']})
    const denied=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'unknown-needs'},body:{...body,eventId:other.event.id,startAt:'2026-12-21T06:00:00.000Z',endAt:'2026-12-21T08:00:00.000Z'}})
    expect(denied.status).toBe(422);expect(denied.body.error.fields.venueId).toContain('ACCESSIBILITY:Other accessibility needs')
  })
  it('TC-CS87-04 calendar editing follows the authoritative current assignment and carries the read version',()=>{
    const booking={id:'room',title:'Room',status:'TENTATIVELY_HELD',requestedById:'original',currentCoordinatorId:'new-coordinator',version:3,venueId:'venue',eventId:'event',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
    expect(coordinatorBookingEditState(booking,'new-coordinator').canEdit).toBe(true)
    expect(coordinatorBookingEditState(booking,'original').canEdit).toBe(false)
    expect(bookingDraftForExisting(booking)).toMatchObject({version:3,eventId:'event'})
  })
  it('TC-CS87-03 offers venue search from the actual Event page with current needs prefilled',async()=>{
    const page=(await import('../../frontend/app/pages/events/[id].vue')).default
    const wrapper=await mountSuspended(page,{route:'/events/event-ui'})
    const add=wrapper.findAll('button').find(b=>b.text()==='Add another venue')
    expect(add?.exists()).toBe(true)
    await add!.trigger('click')
    expect((wrapper.get('#room-attendance').element as HTMLInputElement).value).toBe('80')
    expect((wrapper.get('#room-layout').element as HTMLSelectElement).value).toBe('THEATRE')
    wrapper.unmount()
  })
  it('TC-CS87-08 reads authoritative planning needs through a guarded Event contract', async () => {
    const { event, request } = await fixture.eventFixture()
    const path = `/internal/events/${event.id}/planning-context`
    const result = await api.event.http(path, { headers: { 'x-internal-api-key':'change-me-dev-internal-key' } })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ id:event.id, eventRequestId:request.id, status:'ARRANGEMENT_PENDING', currentCoordinatorId:'coordinator', expectedAttendance:80, preferredLayout:'THEATRE', venueRequirements:'PROJECTOR', accessibilityNeeds:['WHEELCHAIR_ACCESS'] })
    expect((await api.event.http(path, { headers:fixture.coordinator })).status).toBe(403)
    expect((await api.event.http(path, { headers:{'x-internal-api-key':'wrong'} })).status).toBe(403)
  })
  it('TC-CS87-01 gives four rooms independent IDs, needs and decisions; readiness requires every room',async()=>{
    const {event}=await fixture.eventFixture({expectedAttendance:200})
    const rooms=[]
    for(let n=0;n<4;n++){
      const v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput({name:`Room ${n}`,capacity:n?40:300})})
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':`room-${n}`},body:{eventId:event.id,venueId:v.body.id,title:`Room ${n}`,reason:'Conference spaces',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:n?40:200}})
      expect(r.status).toBe(201);rooms.push(r.body)
    }
    expect(new Set(rooms.map((r:any)=>r.id)).size).toBe(4)
    const path=`/venue-bookings/events/${event.id}/summary`
    let summary=await api.booking.http(path,{headers:fixture.coordinator})
    expect(summary.status).toBe(200);expect(summary.body.items).toHaveLength(4);expect(summary.body.venueReady).toBe(false)
    for(const room of rooms.slice(0,3))expect((await api.booking.http(`/venue-bookings/${room.id}/decision`,{method:'PUT',headers:fixture.staff,body:{version:1,status:'CONFIRMED',reason:'Needs verified'}})).status).toBe(200)
    summary=await api.booking.http(path,{headers:fixture.coordinator});expect(summary.body.venueReady).toBe(false)
    expect(summary.body.outstanding.map((r:any)=>r.bookingId)).toEqual([rooms[3].id])
    expect((await api.booking.http(`/venue-bookings/${rooms[3].id}/decision`,{method:'PUT',headers:fixture.staff,body:{version:1,status:'CONFIRMED',reason:'Last room verified'}})).status).toBe(200)
    summary=await api.booking.http(path,{headers:fixture.coordinator});expect(summary.body.venueReady).toBe(true);expect(summary.body.outstanding).toEqual([])
  })
  it('TC-CS87-04 follows current assignment rather than the original requester',async()=>{
    const {event,request}=await fixture.eventFixture()
    const v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput()})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'reassign'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'Conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201)
    await fixture.repository.assignCoordinator(request.id,'new-coordinator','staff','Cover absence')
    const next={'x-test-user-id':'new-coordinator','x-test-role':'EVENT_COORDINATOR'}
    expect((await api.booking.http(`/venue-bookings/${r.body.id}`,{headers:next})).status).toBe(200)
    expect((await api.booking.http('/venue-bookings',{headers:next})).body.items).toHaveLength(1)
    expect((await api.booking.http(`/venue-bookings/${r.body.id}`,{headers:fixture.coordinator})).status).toBe(403)
  })
  it('TC-CS87-09 retains virtual-venue booking when physical capacity and layout are not applicable',async()=>{
    const {event}=await fixture.eventFixture({venueType:'VIRTUAL',preferredLayout:null,accessibilityNeeds:[]})
    const v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput({venueType:'VIRTUAL',address:'',capacity:null,supportedLayouts:[],accessibilityTags:[],setupMinutes:0,turnaroundMinutes:0})})
    expect(v.status).toBe(201)
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'virtual'},body:{eventId:event.id,venueId:v.body.id,title:'Virtual conference',reason:'Online platform',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201);expect(r.body).toMatchObject({layout:'VIRTUAL',expectedAttendance:80,status:'TENTATIVELY_HELD'})
  })
  it('TC-CS87-10 a removed rejected venue keeps its booking visible and can be explicitly released',async()=>{
    const {event}=await fixture.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput()})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'removed'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'Conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201)
    const rejected=await api.booking.http(`/venue-bookings/${r.body.id}/decision`,{method:'PUT',headers:fixture.staff,body:{version:1,status:'REJECTED',reason:'Room will be retired'}})
    expect(rejected.status).toBe(200);expect((await api.venue.http('/venues/'+v.body.id,{method:'DELETE',headers:fixture.staff})).status).toBe(204)
    const summary=await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:fixture.coordinator})
    expect(summary.status).toBe(200);expect(summary.body.items).toHaveLength(1);expect(summary.body.items[0].status).toBe('REJECTED');expect(summary.body.venueReady).toBe(false)
    const released=await api.booking.http(`/venue-bookings/${r.body.id}`,{method:'PUT',headers:fixture.coordinator,body:{...rejected.body,status:'CANCELLED',reason:'Replace retired venue'}})
    expect(released.status).toBe(200);expect(fixture.bookings.getBooking(r.body.id).status).toBe('CANCELLED')
  })
})
