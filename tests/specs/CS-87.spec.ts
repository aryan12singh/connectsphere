import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mockNuxtImport,mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { bookingDraftForExisting,coordinatorBookingEditState } from '../../frontend/app/components/venue/booking-state'
mockNuxtImport('useUserSession',()=>()=>({loggedIn:{value:true},fetch:vi.fn(),user:{value:{id:'coordinator',role:'EVENT_COORDINATOR',permissions:['venue_bookings.create','venues.view','events.view']}}}))
const roomUi=vi.hoisted(()=>({items:[] as any[],send:vi.fn()}))
mockNuxtImport('useRequestFetch',()=>()=>roomUi.send)
mockNuxtImport('useFetch',()=>async(path:any)=>{
  const {ref}=await import('vue')
  const url=typeof path==='function'?path():String(path)
  const value=url.includes('/summary')?{event:{id:'event-ui',title:'Conference',status:'ARRANGEMENT_PENDING',currentCoordinatorId:'coordinator',startAt:'2026-12-21T01:00:00.000Z',endAt:'2026-12-21T10:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,preferredLayout:'THEATRE',accessibilityNeeds:[]},items:roomUi.items,venueReady:false,outstanding:[{bookingId:null,reasons:['NO_VENUE_BOOKING']}]}:url.includes('/options')?{supportedLayouts:[{value:'THEATRE',label:'Theatre'},{value:'CLASSROOM',label:'Classroom'}],facilities:[{value:'PROJECTOR',label:'Projector'}],accessibilityTags:[]}:{items:[],total:0}
  const data=ref(value)
  return {data,error:ref(null),refresh:vi.fn(async()=>{if(url.includes('/summary'))data.value={...value,items:roomUi.items}})}
})
const require = createRequire(import.meta.url)
const fixture = require('../helpers/venue-workflow.cjs')
let api: any
beforeAll(async () => { api = await fixture.stack() })
beforeEach(() => {fixture.reset();roomUi.items=[];roomUi.send.mockReset().mockResolvedValue({items:[],nextCursor:null})})
afterAll(async () => { await api.close() })

describe('CS-87 — independent venue bookings', () => {
  it('TC-CS87-20 a failed move refreshes the selected booking version while preserving the edited search criteria',async()=>{
    const source={id:'retry-room',eventId:'event-ui',venueId:'origin',venueName:'Original room',title:'Breakout',reason:'Original room request',timeZone:'Asia/Singapore',status:'TENTATIVELY_HELD',version:1,startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',expectedAttendance:40,layout:'THEATRE',facilities:[],accessibilityNeeds:[],flags:[]}
    roomUi.items=[source]
    roomUi.send.mockImplementation(async(path:string,options:any)=>{if(path.endsWith('/venue-search'))return {items:[{id:'alternative',name:'Available alternative',capacity:100,setupMinutes:30,turnaroundMinutes:30,match:'FULL',gaps:[],canRequest:true,occupiedStart:source.occupiedStart,occupiedEnd:source.occupiedEnd}]};if(options?.method==='PUT'){roomUi.items=[{...source,version:2,expectedAttendance:45}];throw Object.assign(new Error('Refresh before deciding'),{status:409,code:'STALE_BOOKING'})}return {items:[]}})
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default,wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{await wrapper.findAll('button').find(b=>b.text()==='Find alternatives')!.trigger('click');await flushPromises();await wrapper.get('#room-attendance').setValue('50');await wrapper.get('form').trigger('submit');await flushPromises();await wrapper.get('#room-request-reason').setValue('Keep my updated needs');await wrapper.findAll('button').find(b=>b.text()==='Change this booking')!.trigger('click');await flushPromises();expect(wrapper.get('[data-booking-id="retry-room"]').text()).toContain('45 attendees');expect((wrapper.get('#room-attendance').element as HTMLInputElement).value).toBe('50');await wrapper.get('form').trigger('submit');await flushPromises();expect(roomUi.send.mock.calls.filter(([path])=>String(path).endsWith('/venue-search')).at(-1)?.[1].query).toMatchObject({bookingId:'retry-room',bookingVersion:2,expectedAttendance:50})}finally{wrapper.unmount()}
  })
  it('TC-CS87-21 a route Event change cannot arrange against the previous Event summary while its new fetch is pending',async()=>{
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default,wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{expect(wrapper.findAll('button').some(b=>b.text()==='Add another venue')).toBe(true);await wrapper.setProps({eventId:'other-event'});expect(wrapper.findAll('button').some(b=>b.text()==='Add another venue')).toBe(false);expect(roomUi.send.mock.calls.some(([_path,options])=>options?.method)).toBe(false)}finally{wrapper.unmount()}
  })
  it('TC-CS87-19 venue history preserves the origin and movement while current assignment controls both timelines',async()=>{
    const {event,request}=await fixture.eventFixture(),origin=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput()}),destination=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput({name:'Destination room'})})
    const held=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'history-move'},body:{eventId:event.id,venueId:origin.body.id,title:'Private room',reason:'Private customer purpose',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(held.status).toBe(201);const creation=fixture.bookings.state.activities[0],original=JSON.stringify(creation)
    const moved=await api.booking.http('/venue-bookings/'+held.body.id,{method:'PUT',headers:fixture.coordinator,body:{...held.body,venueId:destination.body.id,reason:'Use the destination room'}})
    expect(moved.status).toBe(200);const movement=fixture.bookings.state.activities[1]
    for(const [venueId,expected] of [[origin.body.id,[creation.id,movement.id]],[destination.body.id,[movement.id]]]){const r=await api.booking.http('/venue-bookings/history?venueId='+venueId,{headers:fixture.staff});expect(r.status).toBe(200);expect(r.body.items.map((row:any)=>row.id).sort()).toEqual(expected.sort());expect(r.body.items.every((row:any)=>row.venueId===venueId)).toBe(true)}
    expect(JSON.stringify(fixture.bookings.state.activities[0])).toBe(original)
    await fixture.repository.assignCoordinator(request.id,'replacement-coordinator','staff','Current assignment changes')
    const replacement={'x-test-user-id':'replacement-coordinator','x-test-role':'EVENT_COORDINATOR'}
    for(const venueId of [origin.body.id,destination.body.id]){expect((await api.booking.http('/venue-bookings/history?venueId='+venueId,{headers:fixture.coordinator})).body.items).toEqual([]);expect((await api.booking.http('/venue-bookings/history?venueId='+venueId,{headers:replacement})).body.items).toHaveLength(venueId===origin.body.id?2:1)}
  })
  it('TC-CS87-16 a rejected booking from a removed venue can move to a suitable alternative with its history and ID retained',async()=>{
    const {event}=await fixture.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput()})
    const alternative=await api.venue.http('/venues',{method:'POST',headers:fixture.staff,body:fixture.venueInput({name:'Available alternative'})})
    const held=await api.booking.http('/venue-bookings',{method:'POST',headers:{...fixture.coordinator,'idempotency-key':'removed-to-alternative'},body:{eventId:event.id,venueId:v.body.id,title:'Retained booking',reason:'Conference',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(held.status).toBe(201)
    const rejected=await api.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:fixture.staff,body:{version:1,status:'REJECTED',reason:'Venue retirement'}})
    expect(rejected.status).toBe(200);expect((await api.venue.http('/venues/'+v.body.id,{method:'DELETE',headers:fixture.staff})).status).toBe(204)
    const search=await api.booking.http(`/venue-bookings/events/${event.id}/venue-search?bookingId=${held.body.id}&bookingVersion=2`,{headers:fixture.coordinator})
    expect(search.status).toBe(200);expect(search.body.items.find((room:any)=>room.id===alternative.body.id).canRequest).toBe(true)
    const historyBefore=[...fixture.bookings.state.activities],moved=await api.booking.http(`/venue-bookings/${held.body.id}`,{method:'PUT',headers:fixture.coordinator,body:{...rejected.body,venueId:alternative.body.id,status:'TENTATIVELY_HELD',reason:'Replace the retired room'}})
    expect(moved.status).toBe(200);expect(moved.body).toMatchObject({id:held.body.id,venueId:alternative.body.id,status:'TENTATIVELY_HELD',version:3});expect(fixture.bookings.listBookings()).toHaveLength(1);expect(fixture.bookings.state.activities.slice(0,historyBefore.length)).toEqual(historyBefore)
  })
  it('TC-CS87-17 changing criteria while a search is pending never restores stale actionable results',async()=>{
    let resolveSearch!:(value:any)=>void
    roomUi.send.mockImplementation((path:string)=>path.endsWith('/venue-search')?new Promise(resolve=>{resolveSearch=resolve}):Promise.resolve({items:[]}))
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default,wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{await wrapper.findAll('button').find(b=>b.text()==='Add another venue')!.trigger('click');await wrapper.get('form').trigger('submit');expect(roomUi.send.mock.calls.filter(([path])=>String(path).endsWith('/venue-search'))).toHaveLength(1);await wrapper.get('#room-attendance').setValue('200');resolveSearch({items:[{id:'old',name:'Stale small room',capacity:100,setupMinutes:0,turnaroundMinutes:0,match:'FULL',gaps:[],canRequest:true,occupiedStart:'2026-12-21T01:00:00.000Z',occupiedEnd:'2026-12-21T10:00:00.000Z'}]});await flushPromises();expect(wrapper.text()).not.toContain('Stale small room');expect(wrapper.findAll('button').some(b=>b.text()==='Request this venue')).toBe(false)}finally{wrapper.unmount()}
  })
  it('TC-CS87-14 a confirmed room can be assessed for alternatives without an unreviewed change action',async()=>{
    roomUi.items=[{id:'approved',eventId:'event-ui',venueId:'original',venueName:'Approved room',title:'Conference',reason:'Approved arrangement',timeZone:'Asia/Singapore',status:'CONFIRMED',version:2,startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:null,expectedAttendance:80,layout:'THEATRE',flags:['BUFFER_CONFLICT']}]
    roomUi.send.mockResolvedValue({items:[{id:'alternative',name:'Suitable alternative',capacity:100,setupMinutes:30,turnaroundMinutes:30,match:'FULL',gaps:[],canRequest:true,occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z'}]})
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default,wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{await wrapper.findAll('button').find(b=>b.text()==='Find alternatives')!.trigger('click');await flushPromises();expect(wrapper.text()).toContain('Suitable alternative');expect(wrapper.text()).toContain('This booking is retained');expect(wrapper.findAll('button').some(b=>['Change this booking','Request this venue'].includes(b.text()))).toBe(false);expect(roomUi.send.mock.calls.every(([_path,options])=>!options?.method || options.method==='GET')).toBe(true)}finally{wrapper.unmount()}
  })
  it('TC-CS87-15 a fresh request after an acknowledged request is released uses a new action key',async()=>{
    const candidate={id:'repeat-venue',name:'Reusable room',capacity:100,setupMinutes:0,turnaroundMinutes:0,match:'FULL',gaps:[],canRequest:true,occupiedStart:'2026-12-21T01:00:00.000Z',occupiedEnd:'2026-12-21T10:00:00.000Z'}
    const requests:any[]=[]
    roomUi.send.mockImplementation(async(path:string,options:any)=>{
      if(path.endsWith('/venue-search'))return {items:roomUi.items.some(room=>room.status==='TENTATIVELY_HELD')?[]:[candidate]}
      if(path==='/api/bookings' && options.method==='POST'){requests.push(options);const saved={...options.body,id:'request-'+requests.length,venueName:'Reusable room',version:1,expiresAt:'2027-01-01T00:00:00.000Z',occupiedStart:candidate.occupiedStart,occupiedEnd:candidate.occupiedEnd,flags:[]};roomUi.items=[saved];return saved}
      return {items:[],nextCursor:null}
    })
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default,wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{
      await wrapper.findAll('button').find(b=>b.text()==='Add another venue')!.trigger('click')
      await wrapper.get('form').trigger('submit');await flushPromises()
      await wrapper.get('#room-request-reason').setValue('Conference room')
      await wrapper.findAll('button').find(b=>b.text()==='Request this venue')!.trigger('click');await flushPromises()
      expect(requests).toHaveLength(1)
      // An explicit release in another session is reflected in the latest read.
      roomUi.items=roomUi.items.map(room=>({...room,status:'CANCELLED',expiresAt:null}))
      await wrapper.findAll('button').find(b=>b.text()==='Refresh arrangements')!.trigger('click');await flushPromises()
      await wrapper.get('form').trigger('submit');await flushPromises()
      await wrapper.findAll('button').find(b=>b.text()==='Request this venue')!.trigger('click');await flushPromises()
      expect(requests).toHaveLength(2);expect(requests[1].body).toEqual(requests[0].body);expect(requests[1].headers['Idempotency-Key']).not.toBe(requests[0].headers['Idempotency-Key'])
    }finally{wrapper.unmount()}
  })
  it('TC-CS87-13 Coordinator changes one unapproved room from prefilled alternatives while retaining its identity and sibling',async()=>{
    const source={id:'room-ui',eventId:'event-ui',venueId:'source-venue',venueName:'Original breakout',title:'Breakout',reason:'Small session',timeZone:'Asia/Singapore',status:'TENTATIVELY_HELD',effectiveStatus:'TENTATIVELY_HELD',version:3,startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',expectedAttendance:40,layout:'CLASSROOM',facilities:['PROJECTOR'],accessibilityNeeds:[],flags:[]}
    const sibling={...source,id:'sibling',venueId:'sibling-venue',venueName:'Retained main room',status:'CONFIRMED',expiresAt:null,expectedAttendance:80,layout:'THEATRE'}
    roomUi.items=[source,sibling]
    roomUi.send.mockImplementation(async(path:string,options:any)=>{
      if(path.endsWith('/venue-search'))return {items:[{id:'alternative-venue',name:'Alternative breakout',capacity:60,setupMinutes:30,turnaroundMinutes:30,match:'FULL',gaps:[],canRequest:true,occupiedStart:source.occupiedStart,occupiedEnd:source.occupiedEnd}],sourceBooking:{id:source.id,version:3,venueId:source.venueId,status:source.status}}
      if(path==='/api/bookings/room-ui' && options.method==='PUT'){const moved={...source,...options.body,venueName:'Alternative breakout',version:4};roomUi.items=[moved,sibling];return moved}
      return {items:[],nextCursor:null}
    })
    const component=(await import('../../frontend/app/components/venue/EventVenueArrangements.vue')).default
    const wrapper=await mountSuspended(component,{props:{eventId:'event-ui'}})
    try{
      const card=wrapper.get('[data-booking-id="room-ui"]'),find=card.findAll('button').find(b=>b.text()==='Find alternatives')
      expect(find?.exists()).toBe(true);await find!.trigger('click');await flushPromises()
      expect((wrapper.get('#room-attendance').element as HTMLInputElement).value).toBe('40')
      expect((wrapper.get('#room-layout').element as HTMLSelectElement).value).toBe('CLASSROOM')
      expect(roomUi.send).toHaveBeenCalledWith('/api/bookings/events/event-ui/venue-search',expect.objectContaining({query:expect.objectContaining({bookingId:'room-ui',bookingVersion:3,expectedAttendance:40,layout:'CLASSROOM',facilities:'PROJECTOR'})}))
      const change=wrapper.findAll('button').find(b=>b.text()==='Change this booking')!
      expect(change.attributes()).toHaveProperty('disabled')
      await wrapper.get('#room-request-reason').setValue('Move the breakout to a quieter space')
      await change.trigger('click');await flushPromises()
      expect(roomUi.send).toHaveBeenCalledWith('/api/bookings/room-ui',expect.objectContaining({method:'PUT',body:expect.objectContaining({venueId:'alternative-venue',version:3,expectedAttendance:40,reason:'Move the breakout to a quieter space',status:'TENTATIVELY_HELD'})}))
      expect(wrapper.get('[data-booking-id="room-ui"]').text()).toContain('Alternative breakout')
      expect(wrapper.get('[data-booking-id="sibling"]').text()).toContain('Retained main room')
      expect(roomUi.send.mock.calls.some(([path])=>path==='/api/bookings')).toBe(false)
      const add=wrapper.findAll('button').find(b=>b.text()==='Add another venue')!;await add.trigger('click')
      expect((wrapper.get('#room-attendance').element as HTMLInputElement).value).toBe('80')
    }finally{wrapper.unmount()}
  })
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
