import { beforeAll,afterAll,describe, expect, it, vi } from 'vitest'
import { createApp, createError, defineEventHandler, getRouterParam, H3Event, readBody, toWebHandler, useSession } from 'h3'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

const entryMocks = vi.hoisted(() => ({
  useFetch: vi.fn(),
  requestFetch: vi.fn(),
  data: { value: { events: [] } as unknown },
  error: { value: null as unknown },
  // The authorised Organiser fixture includes the real default grants; role
  // alone is not an authority source for the navbar's create action.
  sessionUser: { value: { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER', permissions: ['event_requests.create', 'events.view'] } },
  navigateTo: vi.fn(),
  refreshNuxtData: vi.fn(),
}))

mockNuxtImport('useRequestFetch',()=>()=>entryMocks.requestFetch)
mockNuxtImport('useFetch', () => (...args: unknown[]) => {
  entryMocks.useFetch(...args)
  return { data: entryMocks.data, error: entryMocks.error }
})
mockNuxtImport('useUserSession', () => () => ({
  loggedIn: { value: true },
  user: entryMocks.sessionUser,
  fetch: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
}))
mockNuxtImport('useRoute', () => () => ({ path: '/' }))
mockNuxtImport('navigateTo', () => entryMocks.navigateTo)
mockNuxtImport('refreshNuxtData', () => entryMocks.refreshNuxtData)

async function mountNewRequestPage() {
  const pageModules = import.meta.glob('../../frontend/app/pages/requests/new.vue')
  const loadPage = pageModules['../../frontend/app/pages/requests/new.vue']

  expect(loadPage, 'new-request page is not implemented').toBeTypeOf('function')

  const { default: NewRequestPage } = await loadPage!() as { default: Parameters<typeof mountSuspended>[0] }
  return await mountSuspended(NewRequestPage)
}


import { eventHarness,valid } from '../helpers/event-api-harness'
let api:Awaited<ReturnType<typeof eventHarness>>
beforeAll(async()=>{api=await eventHarness()})
afterAll(async()=>{await api.close()})
describe('CS-11 — TC-CS11-01 new-request form renders every Figma information category', () => {
  it('renders all sections, labels and controls from frame 2044:4675', async () => {
    const wrapper = await mountNewRequestPage()
    const text = wrapper.text()

    expect(wrapper.get('h1').text()).toBe('New event request')
    for (const label of [
      'Event name',
      'Purpose',
      'Description',
      'Proposed date',
      'Expected attendance',
      'Start time',
      'End time',
      'Time zone',
      'Minimum capacity',
      'Preferred layout',
      'Venue type',
      'Venue / location requirements',
      'Accessibility needs',
      'Accessibility details',
      'Equipment & technical requirements',
      'Additional technical details',
    ]) expect(text).toContain(label)

    for (const option of [
      'Wheelchair accessible entrance & seating',
      'Hearing loop / assisted listening',
      'Accessible restrooms nearby',
      'No known accessibility needs',
      'Other accessibility needs',
      'Projector & screen',
      'PA system & microphones',
      'Staging / podium',
      'Live streaming setup',
      'No equipment required',
      'Other equipment / technical need',
    ]) expect(text).toContain(option)

    expect(wrapper.get('input[type="date"]')).toBeTruthy()
    expect(wrapper.get('input[type="number"]')).toBeTruthy()
    expect(wrapper.get('button[type="submit"]').text()).toContain('Submit request')
    expect(wrapper.text()).toContain('Save draft')
  })

  it('shares one responsive action bar with the detail form (no separate mobile bar)', async () => {
    const wrapper = await mountNewRequestPage()

    expect(wrapper.find('[data-testid="mobile-action-bar"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Request status"]').exists()).toBe(false)

    const actions = wrapper.findAll('button').filter(b => b.text().includes('Save draft') || b.text().includes('Submit request'))
    expect(actions.length).toBe(2)
    expect(wrapper.get('form').classes()).toContain('mt-6')
  })
})

describe('CS-11 — new-request entry points route to the request form', () => {
  async function mountIndexPage() {
    const pageModules = import.meta.glob('../../frontend/app/pages/index.vue')
    const loadIndexPage = pageModules['../../frontend/app/pages/index.vue']
    expect(loadIndexPage, 'index page is not implemented').toBeTypeOf('function')
    const { default: IndexPage } = await loadIndexPage!() as { default: Parameters<typeof mountSuspended>[0] }
    return await mountSuspended(IndexPage)
  }

  async function mountDefaultLayout() {
    const layoutModules = import.meta.glob('../../frontend/app/layouts/default.vue')
    const loadLayout = layoutModules['../../frontend/app/layouts/default.vue']
    expect(loadLayout, 'default layout is not implemented').toBeTypeOf('function')
    const { default: DefaultLayout } = await loadLayout!() as { default: Parameters<typeof mountSuspended>[0] }
    return await mountSuspended(DefaultLayout)
  }

  it('dashboard desktop and mobile buttons link to /requests/new', async () => {
    const wrapper = await mountIndexPage()
    const links = wrapper.findAll('a[href="/requests/new"]').filter(a => a.text().includes('New event request'))
    expect(links.length).toBe(2)
  })

  it('navbar button links to /requests/new', async () => {
    const wrapper = await mountDefaultLayout()
    const links = wrapper.findAll('a[href="/requests/new"]').filter(a => a.text().includes('New event request'))
    expect(links.length).toBe(1)
  })
})

// The historical empty H3 router was replaced by actual BFF routes + real DB.
// TC17/18 trace today's transactional outbox scope; delivery remains CS50.
const create=(body:any=valid,key?:string)=>api.call('POST','/api/events',body,'owner',key)
describe('CS-11 — TC-CS11-01 capture and persistence',()=>{it('round-trips all categories including zone/instants and optional registration',async()=>{const r=await create({...valid,registrationEnabled:true,registrationOpensAt:'2028-11-01T09:00',registrationClosesAt:'2028-11-18T17:00',technicalDetails:'Power',accessibilityDetails:'Step free'});expect(r.status).toBe(201);expect(r.body).toMatchObject({status:'SUBMITTED',startAt:'2028-11-19T16:00:00.000Z',registrationEnabled:true,technicalDetails:'Power',accessibilityDetails:'Step free'});expect((await api.call('GET','/api/events/'+r.body.id)).body).toEqual(r.body)})})
describe('CS-11 — TC-CS11-02 provisional minimum fields',()=>{it('permits optional fields to be omitted',async()=>{expect((await create({eventName:'Minimum',purpose:'Meeting',proposedDate:'2028-01-01',startTime:'09:00',endTime:'10:00',timeZone:'Asia/Singapore',expectedAttendance:1,venueType:'physical'})).status).toBe(201)})})
describe('CS-11 — TC-CS11-03 mandatory fields',()=>{it('rejects each missing mandatory field',async()=>{for(const field of ['eventName','purpose','proposedDate','startTime','endTime','timeZone','expectedAttendance','venueType']){const p={...valid} as any;delete p[field];const r=await create(p);expect(r.status,field).toBe(422);expect(JSON.stringify(r.body)).toContain(field)}})})
describe('CS-11 — TC-CS11-04 conditional fields',()=>{it('enforces Other layout details and registration dates',async()=>{expect((await create({...valid,preferredLayout:'OTHER',venueRequirements:''})).status).toBe(422);expect((await create({...valid,registrationEnabled:true})).status).toBe(422)})})
describe('CS-11 — TC-CS11-05 field errors',()=>{it('preserves multiple field errors through service and BFF',async()=>{const r=await create({...valid,eventName:'',purpose:'',expectedAttendance:0,endTime:'00:00'});expect(r.status).toBe(422);for(const field of ['eventName','purpose','expectedAttendance','endTime'])expect(JSON.stringify(r.body)).toContain(field)})})
describe('CS-11 — TC-CS11-06 no invented lead time',()=>{it('accepts near/past and distant submission dates',async()=>{for(const proposedDate of ['2026-09-20','2028-06-01'])expect((await create({...valid,proposedDate})).status).toBe(201)})})
describe('CS-11 — TC-CS11-07 stable receipt fields',()=>{it('uses trusted owner and timestamp with unique request ID',async()=>{const r=await create({...valid,organiserId:'spoof'});expect(r.body.organiserId).toBe(api.users.owner.id);expect(r.body.id).toMatch(/^[a-f0-9-]{36}$/);expect(r.body.submittedAt).toEqual(expect.any(String));expect(r.body.statusLabel).toBe('Under Review')})})
describe('CS-11 — TC-CS11-08 receipt interface',()=>{it('displays the persisted ID and its detail link after successful submission',async()=>{entryMocks.requestFetch.mockResolvedValue({id:'confirmed-request',status:'SUBMITTED'});try{const w=await mountNewRequestPage();await w.get('form').trigger('submit');await new Promise(r=>setTimeout(r,0));expect(w.get('[data-testid="submission-receipt"]').text()).toContain('confirmed-request');expect(w.find('a[href="/requests/confirmed-request"]').exists()).toBe(true)}finally{entryMocks.requestFetch.mockReset()}})})
describe('CS-11 — TC-CS11-09 owner detail',()=>{it('returns saved details to its owner',async()=>{const r=await create();expect((await api.call('GET','/api/events/'+r.body.id)).body).toMatchObject({id:r.body.id,eventName:valid.eventName})})})
describe('CS-11 — TC-CS11-10 private request',()=>{it('denies another Organiser without contents',async()=>{const r=await create();const read=await api.call('GET','/api/events/'+r.body.id,undefined,'other');expect(read.status).toBe(403);expect(JSON.stringify(read.body)).not.toContain(valid.eventName)})})
describe('CS-11 — TC-CS11-11 owner mutation only',()=>{it('denies unrelated writes',async()=>{const r=await create();expect((await api.call('PUT','/api/events/'+r.body.id,{version:r.body.version,eventName:'Hijack'},'other')).status).toBe(403)})})
describe('CS-11 — TC-CS11-12 submitted read-only',()=>{it('returns the agreed state conflict for an owner editing Submitted',async()=>{const r=await create();expect((await api.call('PUT','/api/events/'+r.body.id,{version:r.body.version,eventName:'Overwrite'})).status).toBe(409)})})
describe('CS-11 — TC-CS11-13 durable idempotency',()=>{it('simultaneous BFF retries return one logical request',async()=>{const key=crypto.randomUUID();const rs=await Promise.all([create(valid,key),create(valid,key)]);expect(rs.map(r=>r.status)).toEqual([201,201]);expect(rs[0]!.body.id).toBe(rs[1]!.body.id)})})
describe('CS-11 — TC-CS11-14 conflicting intent',()=>{it('rejects changed content under a used key',async()=>{const key=crypto.randomUUID();await create(valid,key);expect((await create({...valid,eventName:'Different'},key)).status).toBe(409)})})
describe('CS-11 — TC-CS11-15 actual activity',()=>{it('records one submission with trusted actor and time',async()=>{const r=await create();const h=await api.call('GET',`/api/events/${r.body.id}/activity`);const entries=h.body.items.filter((a:any)=>a.action==='SUBMITTED');expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({actorId:api.users.owner.id,createdAt:expect.any(String)})})})
describe('CS-11 — TC-CS11-16 assignment integration',()=>{it('feeds its actual assigned Coordinator queue',async()=>{const r=await create();expect(r.body.coordinatorId).toBe(api.users.coord.id);const queue=await api.call('GET','/api/review-queue',undefined,'coord');expect(queue.body.requests.some((x:any)=>x.id===r.body.id)).toBe(true)})})
describe('CS-11 — TC-CS11-17 transactional outbox',()=>{it('writes RequestSubmitted for later delivery',async()=>{const r=await create();const rows=await api.db.outbox.findMany({where:{aggregateId:r.body.id,eventType:'RequestSubmitted'}});expect(rows).toHaveLength(1);expect(rows[0].publishedAt).toBeNull()})})
describe('CS-11 — TC-CS11-18 retries do not duplicate outbox',()=>{it('keeps a single pending submission record on replay',async()=>{const key=crypto.randomUUID();const r=await create(valid,key);await create(valid,key);expect(await api.db.outbox.count({where:{aggregateId:r.body.id,eventType:'RequestSubmitted'}})).toBe(1)})})
describe('CS-11 — TC-CS11-19 incomplete submit',()=>{it('fails instead of creating an implicit draft',async()=>{const count=await api.db.eventRequest.count({where:{organiserId:api.users.owner.id}});expect((await create({eventName:'Partial'})).status).toBe(422);expect(await api.db.eventRequest.count({where:{organiserId:api.users.owner.id}})).toBe(count)})})
describe('CS-11 — TC-CS11-20 trusted role and CSRF',()=>{it('rejects wrong-role creation, unauthenticated sessions and foreign origins',async()=>{expect((await api.call('POST','/api/events',valid,'attendee')).status).toBe(403);expect((await api.call('POST','/api/events',valid,null)).status).toBe(401);expect((await api.call('POST','/api/events',valid,'owner',crypto.randomUUID(),{origin:'https://unrelated.example'})).status).toBe(403)})})


describe('CS-11 — TC-CS11-23 required-field accessibility', () => {
  it('announces mandatory name and purpose while allowing purpose-only Draft save', async () => {
    const wrapper = await mountNewRequestPage()
    expect(wrapper.get('#event-name').attributes('aria-required')).toBe('true')
    expect(wrapper.get('#purpose').attributes('aria-required')).toBe('true')
    await wrapper.get('#purpose').setValue('Incomplete but meaningful draft')
    const save = wrapper.findAll('button').find(button => button.text() === 'Save draft')!
    expect(save.attributes('disabled')).toBeUndefined()
  })
})

// Browser verification found a section heading and control sharing a label target.
describe('CS-11 — TC-CS11-24 field labels target unique form controls', () => {
  it('associates each explicit label with exactly one input, select or textarea', async () => {
    const wrapper = await mountNewRequestPage()
    for (const label of wrapper.findAll('label[for]')) {
      const target = label.attributes('for')
      const controls = wrapper.findAll(`[id="${target}"]`)
      expect(controls, `${target} must be unique`).toHaveLength(1)
      expect(controls[0]!.element.tagName, `${target} must be a form control`).toMatch(/^(INPUT|SELECT|TEXTAREA)$/)
    }
  })
})

describe('CS-11 — TC-CS11-21 current trusted permissions', () => {
  it('denies creation and replay after permission removal without trusting sealed user roles or body grants', async () => {
    const key = crypto.randomUUID()
    const saved = await api.call('POST', '/api/events', valid, 'owner', key)
    expect(saved.status).toBe(201)
    api.permissionOverrides.set('owner', ['events.view'])
    try {
      expect((await api.call('POST', '/api/events', valid, 'owner', key)).status).toBe(403)
      expect((await api.call('POST', '/api/events', { ...valid, permissions: ['event_requests.create'] })).status).toBe(403)
      expect((await api.call('GET', `/api/events/${saved.body.id}`)).status).toBe(200)
    } finally { api.permissionOverrides.delete('owner') }
  })
  it('denies private request and history reads after view permission removal', async () => {
    const saved = await api.call('POST', '/api/events', { purpose: 'Revoked view draft', saveAs: 'draft' })
    expect(saved.status).toBe(201)
    api.permissionOverrides.set('owner', ['event_requests.create'])
    try {
      expect((await api.call('GET', `/api/events/${saved.body.id}`)).status).toBe(403)
      expect((await api.call('GET', `/api/events/${saved.body.id}/activity`)).status).toBe(403)
    } finally { api.permissionOverrides.delete('owner') }
  })
})

describe('CS-11 — TC-CS11-25 form hydration safety', () => {
  it('SSR disables editing and actions until Vue attaches handlers, for every form mode', async () => {
    const { createSSRApp } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const { default: FormPage } = await import('../../frontend/app/components/RequestFormPage.vue')
    const { emptyRequestForm } = await import('../../frontend/app/components/request-form-state')
    for (const mode of ['create', 'draft', 'edit', 'readonly'] as const) {
      const modelValue = { ...emptyRequestForm(), purpose: 'Meaningful preloaded draft' }
      const html = await renderToString(createSSRApp(FormPage, { modelValue, mode, title: 'Request', statusLabel: 'Draft', canEdit: true }))
      const container = document.createElement('div'); container.innerHTML = html
      expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled, mode).toBe(true)
      // The native fieldset disables its checkbox buttons by inheritance.
      // Submission/edit actions sit outside it and need their own disabled state.
      const buttons = [...container.querySelectorAll('form button')].filter(button => !button.closest('fieldset')) as HTMLButtonElement[]
      expect(buttons.length).toBeGreaterThan(0)
      expect(buttons.every(button => button.disabled), mode).toBe(true)
    }
  })
})
