import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it,vi } from 'vitest'
import { createRequire } from 'node:module'
import { mockNuxtImport,mountSuspended } from '@nuxt/test-utils/runtime'
const actions=vi.hoisted(()=>({send:vi.fn(),flags:[] as string[],extensionRequest:null as any}))
mockNuxtImport('useRequestFetch',()=>()=>actions.send)
mockNuxtImport('useFetch',()=>async()=>{const {ref}=await import('vue');return {data:ref({items:[{id:'room-ui',venueId:'venue-ui',venueName:'Bay Hall',eventId:'event-ui',title:'Conference',status:'TENTATIVELY_HELD',effectiveStatus:'TENTATIVELY_HELD',version:1,currentCoordinatorId:'current-coordinator',statusChangedById:'previous-staff',requestedById:'original-requester',reason:'Private customer room',timeZone:'Asia/Singapore',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',expectedAttendance:80,layout:'THEATRE',facilities:['PROJECTOR'],accessibilityNeeds:[],flags:actions.flags,extensionRequest:actions.extensionRequest,extensionCount:0}]}),error:ref(null),refresh:vi.fn()}})
const require = createRequire(import.meta.url)
const f = require('../helpers/venue-workflow.cjs')
let api:any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>{f.reset();actions.send.mockReset();actions.flags=[];actions.extensionRequest=null})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
afterAll(async()=>{await api.close()})
async function hold(){const {event,request}=await f.eventFixture();const v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()});const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'decision'},body:{eventId:event.id,venueId:v.body.id,title:'Conference room',reason:'Client conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}});expect(r.status).toBe(201);return {booking:r.body,event,request,venue:v.body}}
describe('CS-38 — guarded independent decisions',()=>{
  it('TC-CS38-21 only Venue Staff can decide and unauthorized attempts leave the held booking intact',async()=>{
    const {booking}=await hold()
    for(const role of ['EVENT_ORGANISER','EVENT_COORDINATOR','ATTENDEE','TECHNICAL_SUPPORT_STAFF'])expect((await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:{'x-test-user-id':'other','x-test-role':role},body:{version:1,status:'CONFIRMED',reason:'Unauthorized decision'}})).status).toBe(403)
    expect(f.bookings.getBooking(booking.id)).toMatchObject({status:'TENTATIVELY_HELD',version:1})
  })
  it('TC-CS38-22 an already rejected request cannot be approved with a fresh current version',async()=>{
    const {booking}=await hold(),path=`/venue-bookings/${booking.id}/decision`
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason:'Unavailable room'}})).status).toBe(200)
    expect((await api.booking.http(path,{method:'PUT',headers:f.staff,body:{version:2,status:'CONFIRMED',reason:'Attempt to reopen a terminal request'}})).status).toBe(409)
    expect(f.bookings.getBooking(booking.id)).toMatchObject({status:'REJECTED',version:2})
  })
  it('TC-CS38-18 Staff approves only the displayed Coordinator-requested extension deadline',async()=>{
    actions.extensionRequest={requestedById:'current-coordinator',reason:'Awaiting review',expiresAt:'2027-01-01T01:00:00.000Z'}
    const c=(await import('../../frontend/app/components/venue/VenueBookingRequests.vue')).default,w=await mountSuspended(c,{props:{canDecide:true}})
    try{
      expect(w.text()).toContain('Awaiting review')
      expect(w.find('input[type="datetime-local"]').exists()).toBe(false)
      await w.get('#decision-reason-room-ui').setValue('Approved requested extra hour')
      await w.findAll('button').find(b=>b.text()==='Approve extension')!.trigger('click');await new Promise(r=>setTimeout(r,0))
      expect(actions.send).toHaveBeenCalledWith('/api/bookings/room-ui/hold-extension',expect.objectContaining({method:'PUT',body:{version:1,expiresAt:'2027-01-01T01:00:00.000Z',reason:'Approved requested extra hour'}}))
    }finally{w.unmount()}
  })

  it('TC-CS38-17 a legacy hold with a null Event link is also explicitly non-actionable without poisoning healthy requests',async()=>{
    const {booking,venue}=await hold(),orphan=await f.bookings.createBooking({...booking,id:undefined,eventId:null,title:'Unlinked legacy hold',startAt:'2026-12-21T06:00:00.000Z',endAt:'2026-12-21T07:00:00.000Z',flags:[],venueId:venue.id},{id:'staff',role:'VENUE_STAFF'},'null-event-hold')
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const r=await api.booking.http('/venue-bookings?status=TENTATIVELY_HELD',{headers:f.staff})
    expect(r.status).toBe(200);expect(r.body.items).toHaveLength(2)
    expect(r.body.items.find((row:any)=>row.id===orphan.id)).toMatchObject({eventId:null,currentCoordinatorId:null,venueName:venue.name,flags:expect.arrayContaining(['EVENT_NOT_FOUND'])})
    expect(r.body.items.find((row:any)=>row.id===booking.id).flags).not.toContain('EVENT_NOT_FOUND')
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it('TC-CS38-15 one imported hold without an Event stays visible and cannot prevent Staff from reviewing valid requests',async()=>{
    const {booking,venue}=await hold()
    const orphan=await f.bookings.createBooking({...booking,id:undefined,eventId:'missing-imported-event',title:'Imported hold',startAt:'2026-12-21T06:00:00.000Z',endAt:'2026-12-21T07:00:00.000Z',flags:[],venueId:venue.id},{id:'staff',role:'VENUE_STAFF'},'orphan-hold')
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const r=await api.booking.http('/venue-bookings?status=TENTATIVELY_HELD',{headers:f.staff})
    expect(r.status).toBe(200);expect(r.body.items.map((row:any)=>row.id).sort()).toEqual([booking.id,orphan.id].sort())
    expect(r.body.items.find((row:any)=>row.id===orphan.id)).toMatchObject({currentCoordinatorId:null,flags:expect.arrayContaining(['EVENT_NOT_FOUND'])})
    expect((await api.booking.http(`/venue-bookings/${orphan.id}/decision`,{method:'PUT',headers:f.staff,body:{version:orphan.version,status:'REJECTED',reason:'Missing upstream data'}})).status).toBe(404)
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it('TC-CS38-16 an imported hold without its Event has no decision or extension controls',async()=>{
    actions.flags=['EVENT_NOT_FOUND']
    const component=(await import('../../frontend/app/components/venue/VenueBookingRequests.vue')).default,wrapper=await mountSuspended(component,{props:{canDecide:true}})
    try{expect(wrapper.text()).toContain('EVENT_NOT_FOUND');expect(wrapper.get('#decision-reason-room-ui').attributes()).toHaveProperty('disabled');for(const label of ['Approve','Reject'])expect(wrapper.findAll('button').find(b=>b.text()===label)!.attributes()).toHaveProperty('disabled');expect(wrapper.text()).not.toContain('Extend hold deadline')}finally{wrapper.unmount()}
  })
  it('TC-CS38-14 pending queue reads omit a hold that expires during its current-context lookup',async()=>{
    const {booking,venue}=await hold(),clock=require('../../services/booking-service/src/clock'),date=vi.spyOn(clock,'now').mockReturnValue(new Date(Date.parse(booking.expiresAt)-1000)),config=require('../../services/booking-service/src/config'),express=require('../../services/booking-service/node_modules/express'),{start}=require('../helpers/service-integration.cjs')
    const remoteApp=express();remoteApp.get('/venues/:id/internal',async(_req:any,res:any)=>{await new Promise(r=>setTimeout(r,20));date.mockReturnValue(new Date(booking.expiresAt));res.json(venue)})
    const remote=await start(remoteApp),old=config.venueServiceUrl;config.venueServiceUrl=remote.base
    try{const r=await api.booking.http('/venue-bookings?status=TENTATIVELY_HELD',{headers:f.staff});expect(r.status).toBe(200);expect(r.body.items).toEqual([]);expect(r.body.total).toBe(0);expect(f.bookings.getBooking(booking.id).status).toBe('TENTATIVELY_HELD');expect(f.bookings.state.activities).toHaveLength(1)}finally{config.venueServiceUrl=old;await remote.close()}
  })
  it('TC-CS38-13 the open Staff queue disables decisions and extension controls at the hold deadline',async()=>{
    vi.useFakeTimers({toFake:['Date','setInterval','clearInterval']});vi.setSystemTime(new Date('2026-12-31T23:59:59.000Z'))
    const component=(await import('../../frontend/app/components/venue/VenueBookingRequests.vue')).default
    const wrapper=await mountSuspended(component,{props:{canDecide:true}})
    try{
      await wrapper.get('#decision-reason-room-ui').setValue('Verified room')
      const approve=wrapper.findAll('button').find(b=>b.text()==='Approve')!
      expect(approve.attributes()).not.toHaveProperty('disabled')
      await vi.advanceTimersByTimeAsync(1000)
      expect(approve.attributes()).toHaveProperty('disabled')
      expect(wrapper.text()).toContain('expired');expect(wrapper.text()).not.toContain('Extend hold deadline')
      await approve.trigger('click');expect(actions.send.mock.calls.filter(([path])=>String(path).endsWith('/decision') || String(path).endsWith('/hold-extension'))).toEqual([])
    }finally{wrapper.unmount()}
  })
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
  it('TC-CS38-01 confirms the requested hold on Staff approval without another Coordinator action',async()=>{
    const {booking,event}=await hold()
    expect(booking).toMatchObject({status:'TENTATIVELY_HELD',version:1})
    const path=`/venue-bookings/events/${event.id}/summary`
    const pending=await api.booking.http(path,{headers:f.coordinator})
    expect(pending.status).toBe(200);expect(pending.body.venueReady).toBe(false)
    expect(pending.body.policy.pendingClarifications).toEqual([])
    const body={version:booking.version,status:'CONFIRMED',reason:'Room and needs verified'}
    const r=await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body})
    expect(r.status).toBe(200);expect(r.body).toMatchObject({id:booking.id,status:'CONFIRMED',version:2,expiresAt:null,statusChangedById:'staff',statusReason:body.reason})
    expect((await api.booking.http(`/venue-bookings/${booking.id}/decision`,{method:'PUT',headers:f.staff,body})).status).toBe(409)
    expect(f.bookings.state.activities).toHaveLength(2)
    // CS-38 names the independent booking decision message, not Event approval.
    expect(f.bookings.state.outbox.filter((m:any)=>m.kind==='VenueBookingApproved')).toHaveLength(1)
    const approved=await api.booking.http(path,{headers:f.coordinator})
    expect(approved.status).toBe(200);expect(approved.body.venueReady).toBe(true)
    expect(approved.body.event.status).toBe('ARRANGEMENT_PENDING')
    expect(approved.body.items[0]).toMatchObject({id:booking.id,status:'CONFIRMED',version:2})
    expect(approved.body.policy.pendingClarifications).toEqual([])
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

it.each([{reason:'   ',status:422},{reason:'x',status:200},{reason:'x'.repeat(500),status:200},{reason:'x'.repeat(501),status:422}])('TC-CS38-20 decision reasons use trimmed 1..500 characters (%j)',async({reason,status})=>{
 const {booking}=await hold()
 const result=await api.booking.http('/venue-bookings/'+booking.id+'/decision',{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason}})
 expect(result.status).toBe(status)
 const row=await api.booking.http('/venue-bookings/'+booking.id,{headers:f.staff})
 expect(row.body.status).toBe(status===200?'REJECTED':'TENTATIVELY_HELD')
 expect(row.body.version).toBe(status===200?2:1)
})
