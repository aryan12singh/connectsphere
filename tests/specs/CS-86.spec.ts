import { beforeAll,beforeEach,afterAll,afterEach,describe,expect,it,vi } from 'vitest'
import { mockNuxtImport,mountSuspended,registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
const ui=vi.hoisted(()=>({role:'VENUE_STAFF',roles:['VENUE_STAFF'],report:null as any,bookings:[] as any[],send:vi.fn()}))
mockNuxtImport('useUserSession',()=>()=>({user:ref({id:'staff',role:ui.role,roles:ui.roles,permissions:['venues.view','venue_bookings.decide']})}))
mockNuxtImport('useRequestFetch',()=>()=>ui.send)
mockNuxtImport('useFetch',()=>async(path:any)=>{
  const {ref}=await import('vue'),url=typeof path==='function'?path():String(path),data=ref(url.includes('/conflicts')?ui.report:{items:ui.bookings,events:[]})
  return {data,error:ref(null),refresh:vi.fn(async()=>{if(url.includes('/conflicts'))data.value=ui.report})}
})
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),f=require('../helpers/venue-workflow.cjs')
let api:any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>{f.reset();ui.role='VENUE_STAFF';ui.roles=['VENUE_STAFF'];ui.bookings=[];ui.send.mockReset();ui.report={items:[{id:'left',eventId:'first-event',venueId:'venue-ui',venueName:'Bay Hall',title:'First event',currentCoordinatorId:'coordinator-a',status:'CONFIRMED',flags:['BUFFER_CONFLICT'],startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T02:00:00.000Z',occupiedEnd:'2026-12-21T04:45:00.000Z',timeZone:'Asia/Singapore',conflicts:[{id:'right',eventId:'second-event',title:'Second event',status:'CONFIRMED',currentCoordinatorId:'coordinator-b',occupiedStart:'2026-12-21T04:15:00.000Z',occupiedEnd:'2026-12-21T06:45:00.000Z'}]}],venues:[{id:'venue-ui',name:'Bay Hall',version:2,timeZone:'Asia/Singapore',setupMinutes:0,turnaroundMinutes:45}],checkedAt:'2026-10-13T00:00:00.000Z'}})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
afterAll(async()=>{await api.close()})
async function inheritedPair(gapMinutes=15){
  const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),rooms=[]
  for(let i=0;i<2;i++){
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':`inherited-${i}`},body:{eventId:event.id,venueId:v.body.id,title:`Inherited room ${i}`,reason:'Conference',startAt:i?new Date(Date.parse('2026-12-21T04:00:00.000Z')+gapMinutes*60000).toISOString():'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201)
    const approved=await api.booking.http(`/venue-bookings/${r.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Room verified'}})
    expect(approved.status).toBe(200);rooms.push(approved.body)
  }
  const edited=await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:45,version:1})})
  expect(edited.status).toBe(200)
  return {event,venue:edited.body,rooms}
}
describe('CS-86 — preserve and recheck inherited commitments',()=>{
  it('TC-CS86-22 initial rollout automatically flags inherited approvals once without a configuration edit',async()=>{
    const {venue,rooms}=await inheritedPair()
    // Simulate a deployed legacy catalogue: buffers are present, but no change
    // event exists to trigger its initial evaluation.
    f.venues.state.outbox.length=0
    f.venues.state.rollouts.length=0
    const venueBefore=JSON.parse(JSON.stringify(f.venues.getVenue(venue.id))),historyBefore=f.venues.state.history.length
    const worker=require('../../services/venue-service/src/rechecks')
    await worker.drain()
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT']})
    expect(f.venues.getVenue(venue.id)).toEqual(venueBefore)
    expect(f.venues.state.history).toHaveLength(historyBefore)
    const changes=f.bookings.state.activities.filter((row:any)=>row.action==='VENUE_RECHECKED')
    expect(changes).toHaveLength(rooms.length)
    expect(changes.every((row:any)=>row.actorId==='venue-buffer-rollout' && row.actorRole==='SYSTEM')).toBe(true)
    const before=JSON.parse(JSON.stringify({history:f.bookings.state.activities,intents:f.bookings.state.outbox}))
    await worker.drain()
    expect({history:f.bookings.state.activities,intents:f.bookings.state.outbox}).toEqual(before)
    const rollouts=f.venues.state.rollouts ?? []
    expect(rollouts).toHaveLength(1)
    expect(rollouts[0].completedAt).toBeTruthy()
  })
  it('TC-CS86-23 initial rollout survives an unavailable Booking service and retries the same action',async()=>{
    const {venue,rooms}=await inheritedPair();f.venues.state.outbox.length=0;f.venues.state.rollouts.length=0
    const worker=require('../../services/venue-service/src/rechecks'),native=globalThis.fetch
    const failed=vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>String(url).includes('/internal/venue-rechecks')?new Response('Unavailable',{status:503}):native(url,options))
    await worker.drain();failed.mockRestore()
    const pending=await f.venues.pendingRechecks()
    expect(pending.filter((row:any)=>row.venueId===venue.id)).toHaveLength(1)
    expect(pending[0]).toMatchObject({attempts:1,deliveredAt:null})
    expect(f.bookings.getBooking(rooms[0].id).flags).toEqual([])
    const actionId=pending[0].id
    await worker.drain()
    expect(await f.venues.pendingRechecks()).toEqual([])
    expect(f.venues.state.rollouts.find((row:any)=>row.id===actionId)).toMatchObject({attempts:2})
    for(const room of rooms)expect(f.bookings.getBooking(room.id).flags).toContain('BUFFER_CONFLICT')
  })
  it('TC-CS86-24 initial rollout catches a venue arriving after startup without cancelling existing bookings',async()=>{
    const worker=require('../../services/venue-service/src/rechecks')
    await worker.drain()
    const {rooms}=await inheritedPair();f.venues.state.outbox.length=0;f.venues.state.rollouts.length=0
    await worker.drain()
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT']})
  })
  it.each([{id:'20',path:'/venue-bookings/conflicts',stage:'lock'},{id:'21',path:'/venue-bookings/availability',stage:'venue'}])('TC-CS86-$id an expired hold whose venue is removed during a $stage wait cannot poison the read',async({path,stage})=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const held=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'read-remove-'+stage},body:{eventId:event.id,venueId:v.body.id,title:'Expired before read completes',reason:'Read and deletion race',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(held.status).toBe(201)
    const clock=require('../../services/booking-service/src/clock'),date=vi.spyOn(clock,'now').mockReturnValue(new Date(Date.parse(held.body.expiresAt)-1000))
    let reached!:()=>void,release!:()=>void,once=true
    const paused=new Promise<void>(resolve=>{reached=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
    if(stage==='lock'){const native=f.bookings.withLocks;vi.spyOn(f.bookings,'withLocks').mockImplementation(async(keys:any,work:any)=>{if(once && keys.includes('booking:venue:'+v.body.id)){once=false;reached();await gate}return native(keys,work)})}
    else{const native=globalThis.fetch;vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>{if(once && String(url)===api.venue.base+'/venues/'+v.body.id+'/internal'){once=false;reached();await gate}return native(url,options)})}
    const reading=api.booking.http(path,{headers:f.staff})
    try{await paused;date.mockReturnValue(new Date(held.body.expiresAt));expect((await api.venue.http('/venues/'+v.body.id,{method:'DELETE',headers:f.staff})).status).toBe(204);release();const r=await reading;expect(r.status).toBe(200);expect(r.body.items).toEqual([]);expect(f.bookings.getBooking(held.body.id).status).toBe('TENTATIVELY_HELD');expect((await api.booking.http('/venue-bookings/conflicts?venueId=unknown',{headers:f.staff})).status).toBe(404)}finally{release();await reading}
  })
  it.each([{status:'CONFIRMED',options:['CONFIRMED'],readOnly:true},{status:'BLOCKED',options:['BLOCKED','UNAVAILABLE','CANCELLED'],readOnly:false}])('TC-CS86-18 Staff calendar controls follow the current $status booking permissions',async({status,options,readOnly})=>{
    const day=new Date().toISOString().slice(0,10)
    ui.bookings=[{id:'calendar-room',venueId:'venue-ui',title:'Retained calendar record',reason:'Original reason',status,version:2,startAt:`${day}T02:00:00.000Z`,endAt:`${day}T04:00:00.000Z`,timeZone:'Asia/Singapore',flags:[]}]
    const component=(await import('../../frontend/app/components/venue/VenueWorkspace.vue')).default,wrapper=await mountSuspended(component,{props:{venues:[{id:'venue-ui',name:'Bay Hall',timeZone:'Asia/Singapore',isActive:true,setupMinutes:0,turnaroundMinutes:0}]}})
    try{await flushPromises();await wrapper.findAll('button').find(b=>b.text().includes('Retained calendar record'))!.trigger('click');const select=wrapper.findAll('select').find(s=>s.findAll('option').some(o=>o.element.value===status))!;expect(select.findAll('option').map(o=>o.element.value)).toEqual(options);expect(wrapper.get('input[placeholder="Add event title..."]').element.hasAttribute('disabled')).toBe(readOnly);expect(wrapper.findAll('button').find(b=>b.text()==='Save changes')!.element.hasAttribute('disabled')).toBe(readOnly)}finally{wrapper.unmount()}
  })
  it('TC-CS86-16 a room still in turnaround remains in both conflict panes and cannot clear the later booking flag',async()=>{
    const {venue,rooms}=await inheritedPair(),clock=require('../../services/booking-service/src/clock')
    expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:venue.id,version:2,reason:'Initial buffer rollout'}})).status).toBe(200)
    vi.spyOn(clock,'now').mockReturnValue(new Date('2026-12-21T04:05:00.000Z'))
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const report=await api.booking.http('/venue-bookings/conflicts',{headers:f.staff})
    expect(report.status).toBe(200);expect(report.body.items.map((row:any)=>row.id).sort()).toEqual(rooms.map(room=>room.id).sort())
    expect(report.body.items.find((row:any)=>row.id===rooms[0].id).occupiedEnd).toBe('2026-12-21T04:45:00.000Z')
    const checked=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:venue.id,version:2,reason:'Preserve current turnaround conflicts'}})
    expect(checked.status).toBe(200);expect(checked.body.changed).toEqual([])
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it('TC-CS86-17 an authorized secondary Staff role can create operational windows from the actual workspace calendar',async()=>{
    ui.role='EVENT_COORDINATOR';ui.roles=['EVENT_COORDINATOR','VENUE_STAFF'];const received:any[]=[],remove=registerEndpoint('/api/bookings',{method:'POST',handler:async(event:any)=>{const {readBody}=await import('h3');received.push(await readBody(event));return {id:'closure'}}})
    const component=(await import('../../frontend/app/components/venue/VenueWorkspace.vue')).default,wrapper=await mountSuspended(component,{props:{venues:[{id:'venue-ui',name:'Bay Hall',timeZone:'Asia/Singapore',isActive:true,setupMinutes:0,turnaroundMinutes:0}]}})
    try{await flushPromises();const create=wrapper.findAll('button').find(b=>b.text()==='New unavailable window');expect(create?.exists()).toBe(true);await create!.trigger('click');const select=wrapper.findAll('select').find(s=>s.findAll('option').some(o=>o.element.value==='BLOCKED'))!;expect(select.findAll('option').map(o=>o.element.value)).toEqual(['BLOCKED','UNAVAILABLE']);await wrapper.get('input[placeholder="Add event title..."]').setValue('Maintenance');await wrapper.get('textarea').setValue('Operational safety checks');await wrapper.get('form').trigger('submit');await flushPromises();expect(received).toEqual([expect.objectContaining({status:'BLOCKED',eventId:'',title:'Maintenance',reason:'Operational safety checks'})])}finally{wrapper.unmount();remove()}
  })
  it('TC-CS86-06 flagged inherited bookings cannot be deleted and retain every audit record',async()=>{
    const {venue,rooms}=await inheritedPair()
    expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:venue.id,version:venue.version,reason:'Recheck inherited commitments'}})).status).toBe(200)
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const r=await api.booking.http('/venue-bookings/'+rooms[0].id,{method:'DELETE',headers:f.staff})
    expect(r.status).toBe(405);expect(r.body.error.code).toBe('METHOD_NOT_ALLOWED')
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it.each([{gap:44,conflict:true},{gap:45,conflict:false},{gap:46,conflict:false}])('TC-CS86-07 turnaround boundary preserves both bookings at a $gap minute gap',async({gap,conflict})=>{
    const config=require('../../services/booking-service/src/config'),old=config.allowTouching;config.allowTouching=true
    try{const {venue,rooms}=await inheritedPair(gap);expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:venue.id,version:venue.version,reason:'Check configured touching boundary'}})).status).toBe(200);for(const room of rooms){const row=f.bookings.getBooking(room.id);expect(row.status).toBe('CONFIRMED');expect(row.flags.includes('BUFFER_CONFLICT')).toBe(conflict)}}finally{config.allowTouching=old}
  })
  it('TC-CS86-05 ended bookings are not changed or reported during a later recheck',async()=>{
    const {venue}=await inheritedPair(),clock=require('../../services/booking-service/src/clock')
    vi.spyOn(clock,'now').mockReturnValue(new Date('2026-12-22T00:00:00.000Z'))
    const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
    const r=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:venue.id,version:venue.version,reason:'Ignore ended commitments'}})
    expect(r.status).toBe(200);expect(r.body.changed).toEqual([])
    expect((await api.booking.http('/venue-bookings/conflicts',{headers:f.staff})).body.items).toEqual([])
    expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
  })
  it('TC-CS86-08 Staff see both current inherited conflicts before the worker runs, without mutating commitments',async()=>{
    const {venue,rooms}=await inheritedPair(),before=JSON.stringify(f.bookings.state)
    const r=await api.booking.http('/venue-bookings/conflicts?venueId='+venue.id,{headers:f.staff})
    expect(r.status).toBe(200)
    expect(r.body.items.map((item:any)=>item.id).sort()).toEqual(rooms.map(room=>room.id).sort())
    for(const room of rooms){const item=r.body.items.find((item:any)=>item.id===room.id);expect(item.status).toBe('CONFIRMED');expect(item.flags).toContain('BUFFER_CONFLICT');expect(item.conflicts.map((other:any)=>other.id)).toEqual(rooms.filter(other=>other.id!==room.id).map(other=>other.id));expect(item.currentCoordinatorId).toBe('coordinator')}
    expect(JSON.stringify(f.bookings.state)).toBe(before)
    expect((await api.booking.http('/venue-bookings/conflicts',{headers:f.coordinator})).status).toBe(403)
    expect((await api.booking.http('/venue-bookings/conflicts',{headers:{'x-test-user-id':'support','x-test-role':'TECHNICAL_SUPPORT_STAFF','x-test-permissions':'venue_bookings.decide'}})).status).toBe(403)
  })
  it('TC-CS86-09 authenticated Staff can recheck existing bookings for rollout with atomic, idempotent history and intent',async()=>{
    const {venue,rooms}=await inheritedPair(),body={venueId:venue.id,version:venue.version,reason:'Initial buffer rollout verification'}
    const r=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body})
    expect(r.status).toBe(200);expect(r.body.changed.sort()).toEqual(rooms.map(room=>room.id).sort())
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT'],version:3})
    const before=JSON.stringify(f.bookings.state)
    const repeated=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body})
    expect(repeated.status).toBe(200);expect(repeated.body.changed).toEqual([]);expect(JSON.stringify(f.bookings.state)).toBe(before)
    expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{...body,version:1}})).status).toBe(409)
    expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.coordinator,body})).status).toBe(403)
    expect((await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{...body,reason:' '}})).status).toBe(422)
    expect(JSON.stringify(f.bookings.state)).toBe(before)
    expect(f.bookings.state.activities.filter((a:any)=>a.action==='VENUE_RECHECKED').every((a:any)=>a.actorId==='staff' && a.reason===body.reason)).toBe(true)
  })
  it('TC-CS86-03 the actual Staff workspace offers both conflict windows and a reasoned rollout recheck',async()=>{
    const component=(await import('../../frontend/app/components/venue/VenueWorkspace.vue')).default
    const wrapper=await mountSuspended(component,{props:{venues:[]}})
    try{
      const tab=wrapper.findAll('button').find(b=>b.text()==='Buffer conflicts')
      expect(tab?.exists()).toBe(true);await tab!.trigger('click');await flushPromises()
      expect(wrapper.findAll('.conflict-pane')).toHaveLength(2)
      expect(wrapper.text()).toContain('First event');expect(wrapper.text()).toContain('Second event');expect(wrapper.text()).toContain('12:45');expect(wrapper.text()).toContain('12:15')
      const recheck=wrapper.findAll('button').find(b=>b.text()==='Recheck existing bookings')!
      expect(recheck.attributes()).toHaveProperty('disabled')
      await wrapper.get('#recheck-reason-venue-ui').setValue('Initial buffer rollout')
      ui.send.mockImplementation(async()=>{ui.report={...ui.report,items:[]};return {changed:['left','right']}})
      await recheck.trigger('click');await new Promise(r=>setTimeout(r,0))
      expect(ui.send).toHaveBeenCalledWith('/api/bookings/rechecks',{method:'POST',body:{venueId:'venue-ui',version:2,reason:'Initial buffer rollout'}})
      expect(wrapper.text()).toContain('No current venue conflicts')
    }finally{wrapper.unmount()}
  })
  it('TC-CS86-10 a retired rejected room cannot prevent Staff from reviewing other inherited conflicts',async()=>{
    const retired=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'retired'},body:{eventId:retired.event.id,venueId:v.body.id,title:'Retired room',reason:'Retire unused venue',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(r.status).toBe(201)
    expect((await api.booking.http(`/venue-bookings/${r.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'REJECTED',reason:'Retire room'}})).status).toBe(200)
    expect((await api.venue.http('/venues/'+v.body.id,{method:'DELETE',headers:f.staff})).status).toBe(204)
    const pair=await inheritedPair(),report=await api.booking.http('/venue-bookings/conflicts',{headers:f.staff})
    expect(report.status).toBe(200);expect(report.body.items.map((item:any)=>item.id).sort()).toEqual(pair.rooms.map(room=>room.id).sort())
  })
  it('TC-CS86-11 Staff tools recognize an authorized secondary role and stay hidden from Technical Support',async()=>{
    const component=(await import('../../frontend/app/components/venue/VenueWorkspace.vue')).default
    ui.role='EVENT_COORDINATOR';ui.roles=['EVENT_COORDINATOR','VENUE_STAFF']
    const staff=await mountSuspended(component,{props:{venues:[]}})
    try{expect(staff.findAll('button').some(b=>b.text()==='Buffer conflicts')).toBe(true)}finally{staff.unmount()}
    ui.role='TECHNICAL_SUPPORT_STAFF';ui.roles=['TECHNICAL_SUPPORT_STAFF']
    const support=await mountSuspended(component,{props:{venues:[]}})
    try{expect(support.findAll('button').some(b=>b.text()==='Buffer conflicts')).toBe(false);expect(support.findAll('button').some(b=>b.text()==='Booking requests')).toBe(false)}finally{support.unmount()}
  })
  it('TC-CS86-12 legacy confirmed bookings with a missing Event remain visible and auditable without blocking other rechecks',async()=>{
    const pair=await inheritedPair()
    const legacy=await f.bookings.createBooking({eventId:'legacy-missing-event',venueId:pair.venue.id,title:'Legacy confirmed room',reason:'Imported baseline record',status:'CONFIRMED',startAt:'2026-12-21T07:00:00.000Z',endAt:'2026-12-21T08:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:80,layout:'THEATRE',accessibilityNeeds:['WHEELCHAIR_ACCESS']},{id:'staff',role:'VENUE_STAFF'},'legacy-record')
    const report=await api.booking.http('/venue-bookings/conflicts',{headers:f.staff})
    expect(report.status).toBe(200)
    expect(report.body.items.find((row:any)=>row.id===legacy.id)).toMatchObject({status:'CONFIRMED',currentCoordinatorId:null,flags:expect.arrayContaining(['EVENT_NOT_FOUND'])})
    const checked=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:pair.venue.id,version:pair.venue.version,reason:'Review imported commitments'}})
    expect(checked.status).toBe(200);expect(checked.body.changed).toContain(legacy.id)
    expect(f.bookings.getBooking(legacy.id)).toMatchObject({status:'CONFIRMED',eventId:'legacy-missing-event',flags:expect.arrayContaining(['EVENT_NOT_FOUND'])})
    for(const room of pair.rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT']})
  })
  it('TC-CS86-13 a hold expiring during a slow Event lookup is excluded from the recheck without an expiry mutation',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const held=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'slow-recheck'},body:{eventId:event.id,venueId:v.body.id,title:'Room',reason:'Controlled expiry',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
    expect(held.status).toBe(201)
    await f.bookings.createBooking({venueId:v.body.id,title:'Legacy closure',reason:'Existing operational data',status:'BLOCKED',startAt:held.body.startAt,endAt:held.body.endAt,timeZone:'Asia/Singapore'},{id:'staff',role:'VENUE_STAFF'},'legacy-closure')
    const context=(await api.event.http(`/internal/events/${event.id}/planning-context`,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}})).body
    const clock=require('../../services/booking-service/src/clock'),date=vi.spyOn(clock,'now').mockReturnValue(new Date(Date.parse(held.body.expiresAt)-1000)),config=require('../../services/booking-service/src/config'),express=require('../../services/booking-service/node_modules/express'),{start}=require('../helpers/service-integration.cjs')
    const remoteApp=express();remoteApp.get('/internal/events/:id/planning-context',async(_req:any,res:any)=>{await new Promise(r=>setTimeout(r,20));date.mockReturnValue(new Date(held.body.expiresAt));res.json(context)})
    const remote=await start(remoteApp),old=config.eventServiceUrl;config.eventServiceUrl=remote.base
    try{const r=await api.booking.http('/venue-bookings/rechecks',{method:'POST',headers:f.staff,body:{venueId:v.body.id,version:1,reason:'Delayed recheck'}});expect(r.status).toBe(200);expect(r.body.changed).not.toContain(held.body.id);expect(f.bookings.getBooking(held.body.id)).toEqual(held.body);expect(f.bookings.state.outbox.filter((row:any)=>row.aggregateId===held.body.id && row.kind==='VenueConflictChanged')).toEqual([])}finally{config.eventServiceUrl=old;await remote.close()}
  })
  it('TC-CS86-01 flags both approved bookings after a buffer increase and clears them idempotently on resolution',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),rooms=[]
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':`recheck-${i}`},body:{eventId:event.id,venueId:v.body.id,title:`Room ${i}`,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
      expect(r.status).toBe(201)
      const approval=await api.booking.http(`/venue-bookings/${r.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Room verified'}})
      expect(approval.status).toBe(200);rooms.push(approval.body)
    }
    const edited=await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:45,version:1})})
    expect(edited.status).toBe(200)
    const path='/internal/venue-rechecks',headers={'x-internal-api-key':'change-me-dev-internal-key'},body={venueId:v.body.id,version:2,actor:{id:'staff',role:'VENUE_STAFF'},reason:'Longer reset required'}
    const checked=await api.booking.http(path,{method:'POST',headers,body})
    expect(checked.status).toBe(200)
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT'],turnaroundMinutes:45,venueVersion:2})
    expect(f.bookings.state.outbox.filter((m:any)=>m.kind==='VenueConflictChanged')).toHaveLength(2)
    const count=f.bookings.state.activities.length
    expect((await api.booking.http(path,{method:'POST',headers,body})).status).toBe(200)
    expect(f.bookings.state.activities).toHaveLength(count)
    expect((await api.booking.http(path,{method:'POST',headers:f.coordinator,body})).status).toBe(403)
    expect((await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:15,version:2})})).status).toBe(200)
    expect((await api.booking.http(path,{method:'POST',headers,body:{...body,version:3}})).status).toBe(200)
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:[],turnaroundMinutes:15,venueVersion:3})
    expect((await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:f.coordinator})).body.venueReady).toBe(true)
  })
})
