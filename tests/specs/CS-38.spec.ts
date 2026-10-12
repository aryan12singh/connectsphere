import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it,vi } from 'vitest'
import { createRequire } from 'node:module'
import { mockNuxtImport,mountSuspended } from '@nuxt/test-utils/runtime'
const actions=vi.hoisted(()=>({send:vi.fn()}))
mockNuxtImport('useRequestFetch',()=>()=>actions.send)
mockNuxtImport('useFetch',()=>async()=>{const {ref}=await import('vue');return {data:ref({items:[{id:'room-ui',venueId:'venue-ui',venueName:'Bay Hall',eventId:'event-ui',title:'Conference',status:'TENTATIVELY_HELD',effectiveStatus:'TENTATIVELY_HELD',version:1,currentCoordinatorId:'current-coordinator',statusChangedById:'previous-staff',requestedById:'original-requester',reason:'Private customer room',timeZone:'Asia/Singapore',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',expectedAttendance:80,layout:'THEATRE',facilities:['PROJECTOR'],accessibilityNeeds:[],flags:[]}]}),error:ref(null),refresh:vi.fn()}})
const require = createRequire(import.meta.url)
const f = require('../helpers/venue-workflow.cjs')
let api:any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>{f.reset();actions.send.mockReset()})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
afterAll(async()=>{await api.close()})
async function hold(){const {event,request}=await f.eventFixture();const v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()});const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'decision'},body:{eventId:event.id,venueId:v.body.id,title:'Conference room',reason:'Client conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}});expect(r.status).toBe(201);return {booking:r.body,event,request,venue:v.body}}
describe('CS-38 — guarded independent decisions',()=>{
  it('TC-CS38-12 server-rendered Staff inputs and actions stay disabled until handlers attach',async()=>{
    const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer')
    const component=(await import('../../frontend/app/components/venue/VenueBookingRequests.vue')).default
    const html=await renderToString(createSSRApp(component,{canDecide:true}))
    const document=new DOMParser().parseFromString(html,'text/html')
    const reason=document.querySelector('#decision-reason-room-ui')
    expect(reason?.hasAttribute('disabled')).toBe(true)
    expect([...document.querySelectorAll('input,button')].every(control=>control.hasAttribute('disabled'))).toBe(true)
  })
  it('TC-CS38-03 shows the current Coordinator and collects a real rejection reason in the Staff queue',async()=>{
    const component=(await import('../../frontend/app/components/venue/VenueBookingRequests.vue')).default
    const wrapper=await mountSuspended(component,{props:{canDecide:true}})
    expect(wrapper.text()).toContain('current-coordinator');expect(wrapper.text()).not.toContain('previous-staff')
    const rejected=wrapper.findAll('button').find(b=>b.text()==='Reject')!
    expect(rejected.attributes()).toHaveProperty('disabled')
    const send=actions.send.mockResolvedValue({status:'REJECTED'})
    await wrapper.get('#decision-reason-room-ui').setValue('Room is closed for maintenance')
    expect(rejected.attributes()).not.toHaveProperty('disabled')
    await rejected.trigger('click');await new Promise(r=>setTimeout(r,0))
    expect(send).toHaveBeenCalledWith('/api/bookings/room-ui/decision',{method:'PUT',body:{status:'REJECTED',version:1,reason:'Room is closed for maintenance'}})
    wrapper.unmount()
  })
  it('TC-CS38-08 refuses approval when the hold expires while the upstream venue check is in flight',async()=>{
    const {booking,venue}=await hold(),clock=require('../../services/booking-service/src/clock'),config=require('../../services/booking-service/src/config'),express=require('../../services/booking-service/node_modules/express'),{start}=require('../helpers/service-integration.cjs')
    const date=vi.spyOn(clock,'now').mockReturnValue(new Date(Date.parse(booking.expiresAt)-1000))
    const delayed=express();delayed.get(`/venues/${venue.id}/internal`,async(_req:any,res:any)=>{await new Promise(r=>setTimeout(r,30));date.mockReturnValue(new Date(booking.expiresAt));res.json(venue)})
    const remote=await start(delayed),old=config.venueServiceUrl;config.venueServiceUrl=remote.base
    try {const r=await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Delayed check'}});expect(r.status).toBe(409);expect(r.body.error.code).toBe('HOLD_EXPIRED');expect(f.bookings.getBooking(booking.id).status).toBe('TENTATIVELY_HELD');expect(f.bookings.state.activities).toHaveLength(1)}finally{config.venueServiceUrl=old;await remote.close()}
  })
  it('TC-CS38-01 approves its own active hold once without treating it as a conflict',async()=>{
    const {booking}=await hold()
    const body={version:booking.version,status:'CONFIRMED',reason:'Room and needs verified'}
    const r=await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body})
    expect(r.status).toBe(200);expect(r.body).toMatchObject({id:booking.id,status:'CONFIRMED',version:2,expiresAt:null,statusChangedById:'staff',statusReason:body.reason})
    expect((await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body})).status).toBe(409)
    expect(f.bookings.state.activities).toHaveLength(2)
    // CS-38 names the independent booking decision message, not Event approval.
    expect(f.bookings.state.outbox.filter((m:any)=>m.kind==='VenueBookingApproved')).toHaveLength(1)
  })
  it('TC-CS38-02 requires a rejection reason and releases only that booking',async()=>{
    const {booking}=await hold()
    const path=`/venue-bookings/${booking.id}/decision`
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason:' '}})).status).toBe(422)
    expect(f.bookings.getBooking(booking.id).status).toBe('TENTATIVELY_HELD')
    const r=await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason:'Room closure'}})
    expect(r.status).toBe(200);expect(r.body.status).toBe('REJECTED')
    expect(f.bookings.state.outbox.filter((m:any)=>m.kind==='VenueBookingRejected')).toHaveLength(1)
  })
  it('TC-CS38-10 denies coordinator decisions without side effects',async()=>{
    const {booking}=await hold()
    expect((await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.coordinator,body:{version:1,status:'CONFIRMED',reason:'Override'}})).status).toBe(403)
    expect(f.bookings.getBooking(booking.id).status).toBe('TENTATIVELY_HELD');expect(f.bookings.state.activities).toHaveLength(1)
  })
  it('TC-CS38-11 rechecks current requirements and refuses stale approval',async()=>{
    const {booking,request}=await hold()
    await f.repository.updateRequest(request.id,{expectedAttendance:120},request.version)
    const r=await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Needs changed'}})
    expect(r.status).toBe(409);expect(r.body.error.code).toBe('REQUIREMENTS_CHANGED')
    expect(f.bookings.getBooking(booking.id).status).toBe('TENTATIVELY_HELD');expect(f.bookings.state.activities).toHaveLength(1)
  })
})
