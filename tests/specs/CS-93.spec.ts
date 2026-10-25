import {beforeAll,afterAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {mockNuxtImport,mountSuspended,registerEndpoint} from '@nuxt/test-utils/runtime'
import {ref} from 'vue'
const ui=vi.hoisted(()=>({summary:null as any,safety:null as any,inventory:null as any,send:vi.fn()}))
mockNuxtImport('useUserSession',()=>()=>({user:ref({id:'coordinator',role:'EVENT_COORDINATOR',roles:['EVENT_COORDINATOR'],permissions:['venue_bookings.create']})}))
mockNuxtImport('useRequestFetch',()=>()=>ui.send)
mockNuxtImport('useFetch',()=>async(path:any)=>({data:ref(String(typeof path==='function'?path():path).includes('/summary')?ui.summary:String(typeof path==='function'?path():path).includes('/api/safety/')?ui.safety:String(typeof path==='function'?path():path).includes('/api/equipment/inventory')?ui.inventory:{requests:[]}),error:ref(null),refresh:vi.fn()}))
import EventVenueArrangements from '../../frontend/app/components/venue/EventVenueArrangements.vue'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),venueFixture=require('../helpers/venue-workflow.cjs')
let api:any
beforeAll(async()=>{api=await venueFixture.stack()})
afterAll(async()=>{await api.close()})
beforeEach(()=>{ui.safety=null;ui.send.mockReset();ui.summary={event:{id:'event-1',title:'Conference',status:'ARRANGEMENT_PENDING',currentCoordinatorId:'coordinator',startAt:'2028-11-20T02:00:00Z',endAt:'2028-11-20T04:00:00Z',timeZone:'Asia/Singapore',expectedAttendance:80,preferredLayout:'THEATRE',accessibilityNeeds:[]},items:[],venueReady:false,outstanding:[{bookingId:null,reasons:['NO_VENUE_BOOKING']}]}})
describe('CS-93 independent Coordinator preparation UI',()=>{
  it('TC-CS93-48 Coordinator fact-review proof survives metadata/recheck versions but changes for actual venue Safety facts',async()=>{
    venueFixture.reset()
    const f=venueFixture,{event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
    const room=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'review-facts'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Review facts',startAt:'2026-12-21T02:00:00Z',endAt:'2026-12-21T04:00:00Z',timeZone:'Asia/Singapore'}})
    expect(room.status).toBe(201)
    expect((await api.booking.http('/venue-bookings/'+room.body.id+'/decision',{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Current venue checked'}})).status).toBe(200)
    const internal={'x-internal-api-key':'change-me-dev-internal-key'},path='/internal/events/'+event.id+'/readiness'
    const read=async()=>{const r=await api.booking.http(path,{headers:internal});expect(r.status).toBe(200);return r.body}
    const facts=(value:any)=>value.requirementsFingerprint??value.fingerprint,before=await read()
    const current=(await api.venue.http('/venues/'+v.body.id,{headers:f.staff})).body
    const metadata=await api.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...current,name:'Renamed for display',reason:'No Safety facts changed'}});expect(metadata.status).toBe(200)
    const renamed=await read();expect(renamed.fingerprint).not.toBe(before.fingerprint);expect(facts(renamed)).toBe(facts(before))
    const recheck=await api.booking.http('/internal/venue-rechecks',{method:'POST',headers:internal,body:{venueId:v.body.id,version:metadata.body.version,actor:{id:'staff',role:'VENUE_STAFF'},reason:'Asynchronous metadata refresh'}});expect(recheck.status).toBe(200)
    const afterRecheck=await read();expect(afterRecheck.fingerprint).not.toBe(renamed.fingerprint);expect(facts(afterRecheck)).toBe(facts(before))
    const corrected=await api.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...metadata.body,emergencyAccess:'A newly corrected exit route',reason:'Actual emergency-access correction'}});expect(corrected.status).toBe(200)
    const afterCorrection=await read();expect(facts(afterCorrection)).not.toBe(facts(before))
  },20000)
  it('TC-CS93-23 current Venue type and capacity override a Virtual booking snapshot in Safety factors',async()=>{
    venueFixture.reset()
    const {event}=await venueFixture.eventFixture({venueType:'VIRTUAL',preferredLayout:'VIRTUAL',venueRequirements:'',accessibilityNeeds:[]})
    const venue=await api.venue.http('/venues',{method:'POST',headers:venueFixture.staff,body:venueFixture.venueInput({venueType:'VIRTUAL',address:null,capacity:null,supportedLayouts:[],facilities:[],accessibilityTags:[]})})
    expect(venue.status).toBe(201)
    const held=await api.booking.http('/venue-bookings',{method:'POST',headers:{...venueFixture.coordinator,'idempotency-key':'current-safety-type'},body:{eventId:event.id,venueId:venue.body.id,title:'Virtual seminar',reason:'Original online arrangement',startAt:'2026-12-21T02:00:00Z',endAt:'2026-12-21T04:00:00Z',timeZone:'Asia/Singapore',expectedAttendance:80,layout:'VIRTUAL',facilities:[],accessibilityNeeds:[]}})
    expect(held.status).toBe(201)
    const edited=await api.venue.http('/venues/'+venue.body.id,{method:'PUT',headers:venueFixture.staff,body:venueFixture.venueInput({version:1,venueType:'PHYSICAL',capacity:20,reason:'The space is now a physical room'})})
    expect(edited.status).toBe(200)
    const summary=await api.booking.http('/venue-bookings/events/'+event.id+'/summary',{headers:venueFixture.coordinator})
    expect(summary.status).toBe(200);ui.summary=summary.body
    const w=await mountSuspended(EventVenueArrangements,{props:{eventId:event.id}}),room=w.get('[data-safety-booking="'+held.body.id+'"]')
    expect(room.text()).toContain('80 / 20');expect(room.get('[role="alert"]').text()).toContain('Attendance exceeds capacity')
    expect(room.text()).not.toContain('Physical capacity not applicable');w.unmount()
  })
  it('TC-CS93-20 shows current preparation blockers and disables Safety submission',async()=>{
    const wrapper=await mountSuspended(EventVenueArrangements,{props:{eventId:'event-1'}})
    const panel=wrapper.find('[aria-label="Safety preparation"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('No venue booking')
    expect(panel.text()).toContain('Technical/support approval has not been verified')
    expect(panel.find('button').attributes('disabled')).toBeDefined()
    await panel.find('button').trigger('click');expect(ui.send).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('TC-CS93-21 approved venues alone never infer technical approval or enable Safety submission',async()=>{
    ui.summary.venueReady=true;ui.summary.outstanding=[]
    ui.summary.items=[{id:'room-a',eventId:'event-1',venueId:'venue-a',venueName:'Main hall',venueCapacity:100,expectedAttendance:80,layout:'THEATRE',status:'CONFIRMED',effectiveStatus:'CONFIRMED',version:2,required:true,startAt:'2028-11-20T02:00:00Z',endAt:'2028-11-20T04:00:00Z',occupiedStart:'2028-11-20T01:30:00Z',occupiedEnd:'2028-11-20T04:30:00Z',timeZone:'Asia/Singapore',expiresAt:null,flags:[],accessibilityNeeds:[]}]
    const wrapper=await mountSuspended(EventVenueArrangements,{props:{eventId:'event-1'}}),panel=wrapper.find('[aria-label="Safety preparation"]')
    expect(panel.exists()).toBe(true);expect(panel.text()).toContain('Venues are ready for the current requirements')
    expect(panel.text()).toContain('Technical/support approval has not been verified')
    expect(panel.find('button').attributes('disabled')).toBeDefined()
    expect(panel.text()).not.toContain('No equipment required')
    wrapper.unmount()
  })
  it('TC-CS93-22 hides preparation content after Event or current assignment changes',async()=>{
    ui.summary.event.currentCoordinatorId='other-coordinator'
    const wrapper=await mountSuspended(EventVenueArrangements,{props:{eventId:'event-1'}})
    expect(wrapper.find('[aria-label="Safety preparation"]').exists()).toBe(false)
    wrapper.unmount()
    ui.summary.event.currentCoordinatorId='coordinator'
    const moved=await mountSuspended(EventVenueArrangements,{props:{eventId:'event-2'}})
    expect(moved.find('[aria-label="Safety preparation"]').exists()).toBe(false)
    moved.unmount()
  })
})

// Real authenticated, service-owned database and message-boundary acceptance.
if(process.env.CS_SAFETY_ACCEPTANCE==='1') it('TC-CS93-40 complete current venue/technical proof gates a durable Safety review, decision, rework, confirmation and Preparation',async()=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url)
  const {safetyAcceptance}=require('../helpers/safety-live.cjs')
  const evidence=await safetyAcceptance()
  expect(evidence.finalEventStage).toBe('PREPARATION')
},240000)

it('TC-CS93-41 live Safety readiness enables the real versioned submit command',async()=>{
  const posts:any[]=[]
  const proof={event:{id:'event-1',title:'Live planning',status:'ARRANGEMENT_PENDING',version:4},state:'NOT_SUBMITTED',canSubmit:true,requirementsRevision:'review-1',technical:{status:'NOT_REQUIRED'},outstanding:[],snapshot:{eventId:'event-1',eventTitle:'Live planning',venues:[],equipmentStatus:'NOT_REQUIRED',equipment:[]}}
  registerEndpoint('/api/safety/events/event-1',()=>proof)
  registerEndpoint('/api/safety/events/event-1/submit',{method:'POST',handler:async(event:any)=>{const {readBody}=await import('h3');posts.push(await readBody(event));return {state:'PENDING'}}})
  ui.safety=proof
  const w=await mountSuspended(EventVenueArrangements,{props:{eventId:'event-1'}})
  await vi.waitFor(()=>expect(w.get('button[data-safety-submit]').attributes('disabled')).toBeUndefined())
  await w.get('button[data-safety-submit]').trigger('click')
  await vi.waitFor(()=>expect(posts).toEqual([{version:4}]))
  w.unmount()
})

if(process.env.CS_SAFETY_ACCEPTANCE==='1') it('TC-CS93-42 per-room preparation, operational moves and terminal Events preserve current Safety gates',async()=>{
  const {safetyAcceptance}=require('../helpers/safety-live.cjs')
  await safetyAcceptance({exerciseInvalidation:true})
},240000)

if(process.env.CS_SAFETY_ACCEPTANCE==='1') it('TC-CS93-43 actual approved equipment reservations complete the Safety proof atomically',async()=>{
  const {equipmentAcceptance}=require('../helpers/safety-live.cjs')
  await equipmentAcceptance()
},240000)

it('TC-CS93-44 current source facts and terminal status gate confirmation while handover metadata preserves approvals',async()=>{
 const {execFileSync}=await import('node:child_process')
 const output=execFileSync(process.execPath,[require.resolve('../helpers/safety-guards.cjs')],{encoding:'utf8'})
 const observations=output.trim().split('\n').map(line=>JSON.parse(line)).filter(row=>row.case)
 expect(observations).toHaveLength(4)
 expect(observations[0]).toMatchObject({result:'REJECTED',status:409})
 expect(observations[1]).toMatchObject({result:'REJECTED',status:409})
 expect(observations[2]).toMatchObject({result:'ACCEPTED',eventStatus:'CONFIRMED',activityTransitions:[['ARRANGEMENT_PENDING','CONFIRMED']]})
 expect(observations[3]).toMatchObject({result:'ACCEPTED',eventStatus:'CONFIRMED'})
})


it('TC-CS93-47 Technical Support stock stays read-only before and after hydration',async()=>{
 const {createSSRApp}=await import('vue'),{renderToString}=await import('@vue/server-renderer')
 const Page=(await import('../../frontend/app/pages/technical-requirements/index.vue')).default
 ui.inventory={items:[{equipmentType:'projector',total:16,version:14}]}
 try{
  const html=await renderToString(createSSRApp(Page)),document=new DOMParser().parseFromString(html,'text/html')
  expect(document.querySelector('input[aria-label="projector total stock"]')).toBeNull()
  expect([...document.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Save stock')).toBe(false)
  const wrapper=await mountSuspended(Page)
  try{
   const stockTab=wrapper.findAll('[role="tab"]').find(tab=>tab.text()==='Manage equipment stock')!
   await stockTab.trigger('mousedown',{button:0});await stockTab.trigger('click')
   await wrapper.vm.$nextTick()
   expect(wrapper.text()).toContain('Mark stock unavailable')
   expect(wrapper.find('input[aria-label="projector total stock"]').exists()).toBe(false)
   expect(wrapper.findAll('button').some(button=>button.text()==='Save stock')).toBe(false)
  }finally{wrapper.unmount()}
 }finally{ui.inventory=null}
})
