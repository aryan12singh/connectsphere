import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VenueForm from '../../frontend/app/components/venue/VenueForm.vue'
import { createVenueForm, venuePayload } from '../../frontend/app/components/venue/venue-form-state'

process.env.DATA_MODE = 'memory'
process.env.NODE_ENV = 'test'
const require = createRequire(import.meta.url)
const store = require('../../services/venue-service/src/store')
const { start } = require('../helpers/service-integration.cjs')
let api: any,maintenanceBoundary:any,previousBookingUrl:string
const staff = { 'x-test-user-id': 'staff', 'x-test-role': 'VENUE_STAFF' }
const venue = (extra: Record<string, unknown> = {}) => ({ name: 'Buffer Hall', address: 'One Bay', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: ['PROJECTOR'], accessibilityTags: ['WHEELCHAIR_ACCESS'], timeZone: 'Asia/Singapore', managedById: 'staff', reason: 'Set room preparation times', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '00:00', closesAt: '23:59' }], ...extra })
beforeAll(async () => {
 api=await start(require('../../services/venue-service/src/app'))
 const express=require('../../services/venue-service/node_modules/express'),boundary=express();boundary.use(express.json())
 require('../helpers/venue-maintenance-boundary.cjs').mountMaintenanceForwarder(boundary,()=>api.base)
 maintenanceBoundary=await start(boundary);const config=require('../../services/venue-service/src/config');previousBookingUrl=config.bookingServiceUrl;config.bookingServiceUrl=maintenanceBoundary.base
})
beforeEach(() => store.reset())
afterAll(async () => { await api.close();await maintenanceBoundary.close();require('../../services/venue-service/src/config').bookingServiceUrl=previousBookingUrl; store.reset() })

describe('CS-84 — venue buffer HTTP contract', () => {
  it('TC-CS84-03 a Coordinator cannot change Venue Staff buffer settings or create a maintenance operation',async()=>{
    const created=await api.http('/venues',{method:'POST',headers:staff,body:venue({setupMinutes:30,turnaroundMinutes:45})})
    expect(created.status).toBe(201)
    const denied=await api.http('/venues/'+created.body.id,{method:'PUT',headers:{'x-test-user-id':'coordinator','x-test-role':'EVENT_COORDINATOR'},body:{...created.body,setupMinutes:60,reason:'Unauthorized edit'}})
    expect(denied.status).toBe(403)
    expect((await api.http('/venues/'+created.body.id,{headers:staff})).body).toMatchObject({setupMinutes:30,turnaroundMinutes:45,version:1})
  })
  it('TC-CS84-41 a legacy venue without any confirmed booking remains flexible after coordinated initialization',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack(),native=globalThis.fetch
    let intercept:any
    try{
      const v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()}),row=f.venues.state.venues.get(v.body.id)
      row.buffersLockedAt='2026-10-14T00:00:00Z';row.legacyBufferConfigurationPending=true
      const context=(await stack.venue.http(`/venues/${row.id}/legacy-buffer-context`,{headers:f.staff})).body
      const initial=await stack.venue.http(`/venues/${row.id}/legacy-buffers`,{method:'PUT',headers:f.staff,body:{version:context.version,setupMinutes:30,turnaroundMinutes:45,reason:'Initial configuration; no affected Event commitments',communications:[],retainLock:true}})
      expect(initial.status).toBe(200);expect(initial.body.buffersLockedAt).toBeNull();expect(initial.body.legacyBufferConfigurationPending).toBe(false)
      const edited=await stack.venue.http('/venues/'+row.id,{method:'PUT',headers:f.staff,body:{...initial.body,setupMinutes:60,reason:'Still before first confirmation'}})
      expect(edited.status).toBe(200)
      const {event}=await f.eventFixture(),held=await stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'legacy-first-confirmation'},body:{eventId:event.id,venueId:row.id,title:'Room',reason:'First later booking',startAt:event.startAt,endAt:event.endAt,timeZone:event.timeZone}})
      let lose=true;intercept=vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>{const result=await native(url,options);if(String(url).endsWith('/buffer-lock') && lose){lose=false;throw new Error('Lost acknowledgement')}return result})
      expect((await stack.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Interrupted first confirmation'}})).status).toBe(503)
      const fenced=(await stack.venue.http('/venues/'+row.id,{headers:f.staff})).body
      expect((await stack.venue.http(`/venues/${row.id}/buffer-status`,{headers:f.staff})).body.canEdit).toBe(true)
      const recovered=await stack.venue.http('/venues/'+row.id,{method:'PUT',headers:f.staff,body:{...fenced,setupMinutes:90,reason:'No successful confirmation yet'}})
      expect(recovered.status).toBe(200);expect(recovered.body.buffersLockedAt).toBeNull()
    }finally{intercept?.mockRestore();await stack.close()}
  })
  it('TC-CS84-36 an uncommitted confirmation fence can be recovered before the first successful booking',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack(),native=globalThis.fetch
    let intercept:any
    try {
      const {event}=await f.eventFixture(),v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
      const held=await stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'recover-fence'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Recovery fixture',startAt:event.startAt,endAt:event.endAt,timeZone:event.timeZone}})
      let lose=true
      intercept=vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>{const result=await native(url,options);if(String(url).endsWith('/buffer-lock') && lose){lose=false;throw new Error('Lost acknowledgement')}return result})
      expect((await stack.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Approval interrupted'}})).status).toBe(503)
      const current=(await stack.venue.http('/venues/'+v.body.id,{headers:f.staff})).body
      const edited=await stack.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...current,setupMinutes:60,reason:'Adjust before first confirmed booking'}})
      expect(edited.status).toBe(200);expect(edited.body.buffersLockedAt).toBeNull()
      expect(f.bookings.getBooking(held.body.id).status).toBe('TENTATIVELY_HELD')
      expect((await stack.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Successful current approval'}})).status).toBe(200)
      const locked=(await stack.venue.http('/venues/'+v.body.id,{headers:f.staff})).body
      expect((await stack.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...locked,setupMinutes:90,reason:'Forbidden after first confirmation'}})).status).toBe(409)
    } finally {intercept?.mockRestore();await stack.close()}
  })
  it('TC-CS84-37 the legacy form collects both communication steps before emitting a versioned configuration',async()=>{
    const context={venueId:'legacy',version:3,affectedEvents:[{eventId:'event',title:'Conference',coordinatorId:'coordinator',organiserId:'organiser',bookings:[{id:'booking',version:2}]}]}
    const w=await mountSuspended(VenueForm,{props:{venue:{version:3,buffersLockedAt:'2026-10-14T00:00:00Z',legacyBufferConfigurationPending:true},legacyContext:context} as any})
    expect(w.find('#legacy-setup-minutes').exists()).toBe(true)
    await w.get('#legacy-setup-minutes').setValue('60');await w.get('#legacy-buffer-reason').setValue('Initial agreed configuration')
    const save=w.findAll('button').find(b=>b.text()==='Save initial buffers')!
    expect(save.attributes('disabled')).toBeDefined()
    await w.get('#legacy-staff-event').trigger('click');await w.get('#legacy-organiser-event').trigger('click');await w.get('#legacy-note-event').setValue('Coordinator discussed the change with Organiser on 14 October')
    await save.trigger('click')
    expect(w.emitted('configureLegacy')?.[0]?.[0]).toMatchObject({version:3,setupMinutes:60,reason:'Initial agreed configuration',communications:[{eventId:'event',coordinatorId:'coordinator',organiserId:'organiser',staffInformedCoordinator:true,coordinatorInformedOrganiser:true}]})
    await w.get('#legacy-setup-minutes').setValue('90')
    expect(save.attributes('disabled')).toBeDefined()
    expect(w.get('#legacy-note-event').element.value).toBe('')
    await w.get('#legacy-staff-event').trigger('click');await w.get('#legacy-organiser-event').trigger('click');await w.get('#legacy-note-event').setValue('Current values communicated again')
    expect(save.attributes('disabled')).toBeUndefined()
    await w.get('#legacy-turnaround-minutes').setValue('60');expect(save.attributes('disabled')).toBeDefined();expect(w.get('#legacy-note-event').element.value).toBe('')
    w.unmount()
  })
  it('TC-CS84-40 an active legacy commitment with no Event contact cannot silently bypass communication',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack()
    try {
      const v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
      const row=f.venues.state.venues.get(v.body.id);row.buffersLockedAt='2026-10-14T00:00:00Z';row.legacyBufferConfigurationPending=true
      await f.bookings.createBooking({eventId:null,venueId:row.id,requestedById:'old-import',title:'Inherited booking',reason:'Import fixture',status:'CONFIRMED',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'},{id:'staff',role:'VENUE_STAFF'},'legacy-orphan')
      const before=JSON.stringify(f.venues.state)
      expect((await stack.venue.http(`/venues/${row.id}/legacy-buffer-context`,{headers:f.staff})).status).toBe(503)
      expect((await stack.venue.http(`/venues/${row.id}/legacy-buffers`,{method:'PUT',headers:f.staff,body:{version:1,setupMinutes:60,turnaroundMinutes:60,reason:'Unverified contacts',communications:[]}})).status).toBe(503)
      expect(JSON.stringify(f.venues.state)).toBe(before)
    }finally{await stack.close()}
  })
  it('TC-CS84-35 legacy configuration requires current Event communication and consumes its allowance once',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack()
    try {
      const {event}=await f.eventFixture(),v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})})
      const held=await stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'legacy-communication'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Existing commitment',startAt:event.startAt,endAt:event.endAt,timeZone:event.timeZone}})
      expect((await stack.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Approved before policy rollout'}})).status).toBe(200)
      // A pre-policy migration fixture; public clients cannot grant this allowance.
      f.venues.state.venues.get(v.body.id).legacyBufferConfigurationPending=true
      const context=await stack.venue.http(`/venues/${v.body.id}/legacy-buffer-context`,{headers:f.staff})
      expect(context.status).toBe(200)
      expect(context.body.affectedEvents).toMatchObject([{eventId:event.id,coordinatorId:'coordinator',organiserId:'organiser',bookings:[{id:held.body.id,version:2}]}])
      const before=JSON.stringify({venue:f.venues.getVenue(v.body.id),history:f.venues.state.history,outbox:f.venues.state.outbox})
      const body={version:context.body.version,setupMinutes:30,turnaroundMinutes:45,reason:'Coordinated initial configuration',retainLock:false,communications:context.body.affectedEvents.map((e:any)=>({...e,staffInformedCoordinator:true,coordinatorInformedOrganiser:true,note:'Discussed with assigned Coordinator; Coordinator confirmed Organiser informed.'}))}
      for(const communications of [[],body.communications.map((e:any)=>({...e,coordinatorId:'former'})),body.communications.map((e:any)=>({...e,coordinatorInformedOrganiser:false})),body.communications.map((e:any)=>({...e,note:' '}))]) {
        expect((await stack.venue.http(`/venues/${v.body.id}/legacy-buffers`,{method:'PUT',headers:f.staff,body:{...body,communications}})).status).toBeGreaterThanOrEqual(400)
        expect(JSON.stringify({venue:f.venues.getVenue(v.body.id),history:f.venues.state.history,outbox:f.venues.state.outbox})).toBe(before)
      }
      expect((await stack.venue.http(`/venues/${v.body.id}/legacy-buffers`,{method:'PUT',headers:f.coordinator,body})).status).toBe(403)
      const changed=await stack.venue.http(`/venues/${v.body.id}/legacy-buffers`,{method:'PUT',headers:f.staff,body})
      expect(changed.status).toBe(200);expect(changed.body).toMatchObject({setupMinutes:30,turnaroundMinutes:45,legacyBufferConfigurationPending:false})
      expect(changed.body.buffersLockedAt).toBeTruthy()
      expect(f.bookings.getBooking(held.body.id)).toMatchObject({status:'CONFIRMED',version:2})
      const audit=f.venues.state.history.find((h:any)=>h.action==='LEGACY_BUFFERS_CONFIGURED')
      expect(audit).toMatchObject({actorId:'staff',changes:{communications:[{eventId:event.id,coordinatorId:'coordinator',organiserId:'organiser',staffInformedCoordinator:true,coordinatorInformedOrganiser:true}]}})
      expect(f.venues.state.outbox).toHaveLength(1)
      expect((await stack.venue.http(`/venues/${v.body.id}/legacy-buffers`,{method:'PUT',headers:f.staff,body:{...body,version:changed.body.version}})).status).toBe(409)
      expect((await stack.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:{...changed.body,setupMinutes:90,reason:'No later override'}})).status).toBe(409)
    } finally {await stack.close()}
  })
  it('TC-CS84-31 confirmation freezes buffers while unrelated venue maintenance remains available',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack()
    try{
      const {event}=await f.eventFixture(),v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
      const held=await stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'freeze'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Freeze test',startAt:event.startAt,endAt:event.endAt,timeZone:event.timeZone}})
      const decision=await stack.booking.http(`/venue-bookings/${held.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Reviewed'}})
      expect(decision.status).toBe(200)
      const current=(await stack.venue.http('/venues/'+v.body.id,{headers:f.staff})).body
      const changed=await stack.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...current,setupMinutes:90,reason:'Forbidden late buffer edit'}})
      expect(changed.status).toBe(409);expect(changed.body.error.code).toBe('VENUE_BUFFERS_LOCKED')
      expect((await stack.venue.http('/venues/'+v.body.id,{method:'PUT',headers:f.staff,body:{...current,name:'Renamed hall',reason:'Unrelated maintenance'}})).status).toBe(200)
      expect(f.venues.getVenue(v.body.id).setupMinutes).toBe(30)
    }finally{await stack.close()}
  })
  it('TC-CS84-33 lost lock acknowledgement preserves the hold and a retry safely confirms it',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack(),native=globalThis.fetch
    let intercept:any
    try{
      const {event}=await f.eventFixture(),v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()})
      const held=await stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'uncertain-freeze'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Uncertain response test',startAt:event.startAt,endAt:event.endAt,timeZone:event.timeZone}})
      let lose=true
      intercept=vi.spyOn(globalThis,'fetch').mockImplementation(async(url:any,options:any)=>{const result=await native(url,options);if(String(url).endsWith('/buffer-lock') && lose){lose=false;throw new Error('Lost acknowledgement')}return result})
      const path=`/venue-bookings/${held.body.id}/decision`,body={version:1,status:'CONFIRMED',reason:'Reviewed'}
      expect((await stack.booking.http(path,{method:'PUT',headers:f.staff,body})).status).toBe(503)
      expect(f.bookings.getBooking(held.body.id)).toMatchObject({status:'TENTATIVELY_HELD',version:1})
      expect(f.venues.getVenue(v.body.id).buffersLockedAt).toBeTruthy()
      expect((await stack.booking.http(path,{method:'PUT',headers:f.staff,body})).status).toBe(200)
      expect(f.venues.state.history.filter((h:any)=>h.action==='VENUE_BUFFERS_LOCKED')).toHaveLength(1)
    }finally{intercept?.mockRestore();await stack.close()}
  })
  it('TC-CS84-34 locked buffers are disabled while other form fields remain editable',async()=>{
    const w=await mountSuspended(VenueForm,{props:{venue:{name:'Locked hall',setupMinutes:30,turnaroundMinutes:45,buffersLockedAt:'2026-10-14T00:00:00Z'}}})
    expect(w.get('#venue-setup-minutes').attributes('disabled')).toBeDefined();expect(w.get('#venue-turnaround-minutes').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Other details remain editable');w.unmount()
  })
  it('TC-CS84-17 a virtual form with no physical capacity sends the existing nullable contract',()=>{
    expect(venuePayload(createVenueForm({venueType:'VIRTUAL',capacity:''}),'staff').capacity).toBeNull()
    expect(venuePayload(createVenueForm({venueType:'PHYSICAL',capacity:''}),'staff').capacity).toBe('')
  })
  it('TC-CS84-02 exposes both minute controls and converts their numeric input without dropping the version',async()=>{
    const wrapper=await mountSuspended(VenueForm,{props:{venue:{name:'Bay Hall',capacity:100,setupMinutes:30,turnaroundMinutes:45,version:2} as any}})
    expect(wrapper.find('#venue-setup-minutes').exists()).toBe(true)
    expect(wrapper.find('#venue-turnaround-minutes').exists()).toBe(true)
    const payload=venuePayload(createVenueForm({setupMinutes:'30',turnaroundMinutes:'45',version:2} as any),'staff')
    expect(payload).toMatchObject({setupMinutes:30,turnaroundMinutes:45,version:2})
    expect(venuePayload(createVenueForm({setupMinutes:''} as any),'staff').setupMinutes).not.toBe(0)
    wrapper.unmount()
  })
  it('TC-CS84-07 stores both supplied durations through the real venue handler', async () => {
    const result = await api.http('/venues', { method: 'POST', headers: staff, body: venue({ setupMinutes: 30, turnaroundMinutes: 45 }) })
    expect(result.status).toBe(201)
    expect(result.body.setupMinutes).toBe(30)
    expect(result.body.turnaroundMinutes).toBe(45)
    expect(store.getVenue(result.body.id)).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 })
  })
  it('TC-CS84-13 uses zero compatibility defaults for an existing create payload', async () => {
    const r = await api.http('/venues', { method: 'POST', headers: staff, body: venue() })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0 })
  })
  it.each([-1, 480.5, 481, '30', 'abc', null, true])('TC-CS84-04 TC-CS84-06 rejects invalid buffer data (%s) without catalogue/history writes', async value => {
    for (const field of ['setupMinutes', 'turnaroundMinutes']) {
      const r = await api.http('/venues', { method: 'POST', headers: staff, body: venue({ [field]: value }) })
      expect(r.status).toBe(422)
      expect(r.body.error.fields[field]).toEqual(expect.any(Array))
      expect(store.listVenues()).toEqual([])
      expect(store.state.history).toEqual([])
    }
  })
  it.each([0, 480])('TC-CS84-06 accepts an explicit configured boundary (%s)', async value => {
    const r = await api.http('/venues', { method: 'POST', headers: staff, body: venue({ setupMinutes: value, turnaroundMinutes: value }) })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ setupMinutes: value, turnaroundMinutes: value })
  })
  it('TC-CS84-01 legacy catalogue updates preserve existing buffers', async () => {
    const created = await api.http('/venues', { method: 'POST', headers: staff, body: venue({ setupMinutes: 30, turnaroundMinutes: 45 }) })
    const updated = await api.http('/venues/'+created.body.id, { method: 'PUT', headers: staff, body: venue({ capacity: 150 }) })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ capacity: 150, setupMinutes: 30, turnaroundMinutes: 45 })
  })
  it.each(['-1','abc','1.5','2147483648'])('TC-CS84-06 refuses an invalid configured cap (%s) at startup', value => {
    const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', require.resolve('../../services/venue-service/src/config.js')], { env: { ...process.env, DATA_MODE:'memory', MAX_VENUE_BUFFER_MINUTES:value }, encoding:'utf8' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('MAX_VENUE_BUFFER_MINUTES')
  })
  it('TC-CS84-14 saves one durable recheck and rejects stale buffer changes without further writes',async()=>{
    const created=await api.http('/venues',{method:'POST',headers:staff,body:venue()})
    const body=venue({version:1,setupMinutes:30,turnaroundMinutes:45,reason:'Preparation and reset requirements'})
    const updated=await api.http('/venues/'+created.body.id,{method:'PUT',headers:staff,body})
    expect(updated.status).toBe(200);expect(updated.body.version).toBe(2)
    expect(store.state.outbox ?? []).toHaveLength(1)
    expect(store.state.outbox[0]).toMatchObject({venueId:created.body.id,version:2,deliveredAt:null})
    expect((await api.http('/venues/'+created.body.id,{method:'PUT',headers:staff,body:{...body,setupMinutes:60}})).status).toBe(409)
    expect(store.state.history).toHaveLength(2);expect(store.state.outbox).toHaveLength(1)
  })
  it('TC-CS84-15 retries a failed recheck from the real running service with a stable action ID',async()=>{
    const express=require('../../services/booking-service/node_modules/express'),sink=express(),calls:any[]=[]
    let recover=false,childVenueBase=''
    sink.use(express.json());sink.post('/internal/venue-rechecks',(req:any,res:any)=>{calls.push(req.body);res.status(recover?200:503).json({venueId:req.body.venueId,version:req.body.version})})
    require('../helpers/venue-maintenance-boundary.cjs').mountMaintenanceForwarder(sink,()=>childVenueBase)
    const downstream=await start(sink)
    const child=spawn(process.execPath,[require.resolve('../../services/venue-service/src/server.js')],{env:{...process.env,PORT:'0',DATA_MODE:'memory',NODE_ENV:'test',BOOKING_SERVICE_URL:downstream.base,RECHECK_POLL_MS:'50'},stdio:['ignore','pipe','pipe']})
    let output=''
    try {
      const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Venue fixture did not start: '+output)),4000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});child.stderr.on('data',chunk=>{output+=chunk});child.on('exit',()=>{clearTimeout(timer);reject(new Error('Venue fixture exited: '+output))})})
      childVenueBase=`http://127.0.0.1:${port}`
      const call=async(path:string,body:any)=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:path==='/venues'?'POST':'PUT',headers:{...staff,'content-type':'application/json'},body:JSON.stringify(body)});expect(r.status).toBe(path==='/venues'?201:200);return await r.json()}
      const v=await call('/venues',venue())
      await call('/venues/'+v.id,venue({version:1,setupMinutes:30,turnaroundMinutes:45}))
      for(let i=0;i<12 && !calls.length;i++)await new Promise(r=>setTimeout(r,100))
      expect(calls.length).toBeGreaterThan(0)
      recover=true
      for(let i=0;i<12 && calls.length<2;i++)await new Promise(r=>setTimeout(r,100))
      expect(calls.length).toBeGreaterThanOrEqual(2);expect(new Set(calls.map(c=>c.actionId)).size).toBe(1);expect(calls[0].actionId).toEqual(expect.any(String))
      await new Promise(r=>setTimeout(r,150));const count=calls.length
      await new Promise(r=>setTimeout(r,150));expect(calls).toHaveLength(count)
    } finally {child.kill('SIGTERM');await new Promise<void>(r=>child.exitCode!==null?r():child.once('exit',()=>r()));await downstream.close()}
  },10000)
  it('TC-CS84-16 deletion waits for an in-flight booking commitment and cannot orphan its venue',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),stack=await f.stack(),config=require('../../services/booking-service/src/config'),express=require('../../services/booking-service/node_modules/express')
    const {event}=await f.eventFixture(),v=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput()}),proxy=express()
    let release:any,reached:any;const gate=new Promise(r=>{release=r}),ready=new Promise(r=>{reached=r})
    proxy.get(`/venues/${v.body.id}/internal`,async(_req:any,res:any)=>{const row=await stack.venue.http(`/venues/${v.body.id}/internal`,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}});reached();await gate;res.json(row.body)})
    const upstream=await start(proxy),old=config.venueServiceUrl;config.venueServiceUrl=upstream.base
    try{
      const hold=stack.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'delete-race'},body:{eventId:event.id,venueId:v.body.id,title:'Conference',reason:'Race fixture',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
      await ready
      const deletion=stack.venue.http('/venues/'+v.body.id,{method:'DELETE',headers:f.staff})
      await new Promise(r=>setTimeout(r,50));release()
      const [booked,deleted]=await Promise.all([hold,deletion])
      expect(booked.status).toBe(201);expect(deleted.status).toBe(409);expect(f.venues.getVenue(v.body.id)).not.toBeNull()
    }finally{release();config.venueServiceUrl=old;await upstream.close();await stack.close()}
  })
})

if(process.env.CS_MAINTENANCE_ACCEPTANCE==='1') it('TC-CS84-43 durable owner maintenance fence blocks readiness after downstream timeout and before actual Venue commit',async()=>{
 const {maintenanceTimeout}=require('../helpers/venue-maintenance-live.cjs')
 const result=await maintenanceTimeout()
 expect(result.pendingBlockedReadiness).toBe(true)
 expect(result.lateApplyCompleted).toBe(true)
 expect(result.exactReplayStatus).toBe(200)
},120000)
