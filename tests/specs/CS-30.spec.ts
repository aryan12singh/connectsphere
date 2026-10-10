import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { eventHarness, valid } from '../helpers/event-api-harness'
let api:Awaited<ReturnType<typeof eventHarness>>
beforeAll(async()=>{api=await eventHarness()})
afterAll(async()=>api.close())
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

// CS-30 — single file per story (IS212/IEEE 829). Organiser-visible slice
// (Phase A): current coordinator banner, secure owner view, reusable edit
// form.

const detailMocks = vi.hoisted(() => ({
  useFetch: vi.fn(),
  actionFetch: vi.fn(),
  eventResponse: { value: null as unknown },
  eventError: { value: null as unknown },
  coordinatorResponse: { value: null as unknown },
  putResponse: { value: null as unknown },
  putError: { value: null as unknown },
  queueResponse: { value: null as unknown },
  queueError: { value: null as unknown },
  queueRefresh: vi.fn(),
  decisionResponse: { value: null as unknown },
  decisionError: { value: null as unknown },
  sessionUser: { value: null as null | { id: string, email: string, name: string, role: string } },
  navigateTo: vi.fn(),
  refreshNuxtData: vi.fn(),
}))

for(const name of ['eventResponse','eventError','coordinatorResponse','queueResponse','queueError'] as const)(detailMocks as any)[name]=ref(detailMocks[name].value)
mockNuxtImport('useRequestFetch',()=>()=>detailMocks.actionFetch)
mockNuxtImport('useFetch', () => (url: unknown, init?: { method?: string }) => {
  detailMocks.useFetch(url, init)
  if (typeof url === 'string' && url.endsWith('/coordinator'))
    return { data: detailMocks.coordinatorResponse, error: { value: null } }
  if (typeof url === 'string' && url === '/api/review-queue')
    return { data: detailMocks.queueResponse, error: detailMocks.queueError, refresh: detailMocks.queueRefresh }
  if (typeof url === 'string' && url === '/api/review-queue')
    return { data: detailMocks.queueResponse, error: detailMocks.queueError, refresh: detailMocks.queueRefresh }
  if (typeof url === 'string' && url.includes('/decision'))
    return { data: detailMocks.decisionResponse, error: detailMocks.decisionError }
  if ((init as { method?: string } | undefined)?.method === 'PUT')
    return { data: detailMocks.putResponse, error: detailMocks.putError }
  return { data: detailMocks.eventResponse, error: detailMocks.eventError }
})
mockNuxtImport('useUserSession', () => () => ({
  loggedIn: { value: true },
  user: detailMocks.sessionUser,
  fetch: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
}))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'req-1' } }))
mockNuxtImport('navigateTo', () => detailMocks.navigateTo)
mockNuxtImport('refreshNuxtData', () => detailMocks.refreshNuxtData)

const SUBMITTED_EVENT = { version:1, id: 'req-1',
  organiserId: 'u-organiser',
  status: 'SUBMITTED',
  submittedAt: '2026-09-20T00:00:00.000Z',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
  coordinatorId: 'u-coordinator',
  eventName: 'Autumn Product Summit',
  purpose: 'Product launch',
  description: 'Annual gathering.',
  proposedDate: '2026-11-20',
  expectedAttendance: 200,
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Asia/Singapore',
  minimumCapacity: 220,
  preferredLayout: 'theatre',
  venueType: 'physical',
  venueRequirements: 'Hall A',
  accessibilityNeeds: ['wheelchair'],
  accessibilityDetails: '',
  equipmentNeeds: ['projector'],
  technicalDetails: '',
}

const COORDINATOR = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }

async function mountDetailPage() {
  const pageModules = import.meta.glob('../../frontend/app/pages/requests/[id].vue')
  const loadPage = pageModules['../../frontend/app/pages/requests/[id].vue']
  expect(loadPage, 'request detail page is not implemented').toBeTypeOf('function')
  const { default: DetailPage } = await loadPage!() as { default: Parameters<typeof mountSuspended>[0] }
  return await mountSuspended(DetailPage)
}

function showSubmittedWithCoordinator() {
  detailMocks.sessionUser.value = {id:'u-organiser',email:'o@example.test',name:'Owner',role:'EVENT_ORGANISER'}
  detailMocks.eventResponse = ref({...SUBMITTED_EVENT})
  detailMocks.eventError.value = null
  detailMocks.coordinatorResponse.value = COORDINATOR
  detailMocks.putResponse.value = null
  detailMocks.putError.value = null
  detailMocks.useFetch.mockReset()
  detailMocks.navigateTo.mockReset()
  detailMocks.refreshNuxtData.mockReset()
}

describe('CS-30 — TC-CS30-02 organiser sees the current coordinator contact', () => {
  it('shows the assigned coordinator name and email below the heading', async () => {
    showSubmittedWithCoordinator()
    const wrapper = await mountDetailPage()
    const banner = wrapper.get('[data-testid="coordinator-banner"]')
    expect(banner.text()).toContain('Coordinator One')
    expect(banner.text()).toContain('coordinator@example.com')
  })

  it('shows no banner while the request has no coordinator', async () => {
    detailMocks.eventResponse.value = { ...SUBMITTED_EVENT, coordinatorId: null }
    detailMocks.eventError.value = null
    detailMocks.coordinatorResponse.value = null
    const wrapper = await mountDetailPage()
    expect(wrapper.find('[data-testid="coordinator-banner"]').exists()).toBe(false)
  })

  it('prepopulates the form with the record data', async () => {
    showSubmittedWithCoordinator()
    const wrapper = await mountDetailPage()
    expect((wrapper.get('#event-name').element as HTMLInputElement).value).toBe('Autumn Product Summit')
    expect((wrapper.get('#venue-type').element as HTMLSelectElement).value).toBe('physical')
    expect((wrapper.get('#proposed-date').element as HTMLInputElement).value).toBe('2026-11-20')
    expect((wrapper.get('#expected-attendance').element as HTMLInputElement).value).toBe('200')
  })
})

describe('CS-30 — TC-CS30-03 submitted request is read-only; returned requests allow amendments', () => {
  it('renders disabled fields without an Edit action', async () => {
    showSubmittedWithCoordinator()
    const wrapper = await mountDetailPage()
    expect(wrapper.find('fieldset[disabled]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Edit request')
  })

  it('edit mode enables the reusable form and saves through PUT', async () => {
    showSubmittedWithCoordinator()
    detailMocks.eventResponse.value = {...SUBMITTED_EVENT,status:'RETURNED_FOR_AMENDMENT'}
    detailMocks.actionFetch.mockResolvedValue({...SUBMITTED_EVENT,eventName:'Renamed Summit'})
    const wrapper = await mountDetailPage()
    const editButtons = wrapper.findAll('button').filter(b => b.text().includes('Edit request'))
    expect(editButtons.length > 0, 'edit action is not rendered').toBe(true)
    await editButtons[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('#event-name').attributes('disabled')).toBe(undefined)
    await wrapper.get('#event-name').setValue('Renamed Summit')
    await wrapper.get('#request-form').trigger('submit')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    const puts = detailMocks.actionFetch.mock.calls.filter(([url, init]) => url === '/api/events/req-1' && (init as { method?: string })?.method === 'PUT')
    expect(puts.length).toBe(1)
    expect((puts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ eventName: 'Renamed Summit' })
    expect(detailMocks.refreshNuxtData).toHaveBeenCalledWith(['event-coordinator-req-1', 'organiser-events'])
    expect(wrapper.text()).toContain('submitted for review')
  })
})

describe('CS-30 — TC-CS30-04 draft opens editable with submit available', () => {
  it('draft shows enabled fields and submits through PUT submit=true', async () => {
    showSubmittedWithCoordinator()
    detailMocks.actionFetch.mockResolvedValue({...SUBMITTED_EVENT,id:'req-2',status:'SUBMITTED'})
    detailMocks.eventResponse.value = { ...SUBMITTED_EVENT, id: 'req-2', status: 'DRAFT', coordinatorId: null, submittedAt: null }
    detailMocks.eventError.value = null
    detailMocks.coordinatorResponse.value = null
    detailMocks.putResponse.value = { id: 'req-2', status: 'SUBMITTED' }
    detailMocks.putError.value = null
    detailMocks.useFetch.mockReset()
    detailMocks.navigateTo.mockReset()
    const wrapper = await mountDetailPage()
    expect(wrapper.get('#event-name').attributes('disabled')).toBe(undefined)
    await wrapper.get('#request-form').trigger('submit')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    const puts = detailMocks.actionFetch.mock.calls.filter(([url, init]) => typeof url === 'string' && url.startsWith('/api/events/') && (init as { method?: string })?.method === 'PUT')
    expect(puts.length).toBe(1)
    expect((puts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ submit: true })
    expect(wrapper.text()).toContain('submitted for review')
  })
})

describe('CS-30 — TC-CS30-05 unavailable request shows an error state', () => {
  it('renders an error when the request cannot be loaded', async () => {
    detailMocks.eventResponse.value = null
    detailMocks.eventError.value = { statusCode: 404, message: 'Not found' }
    detailMocks.coordinatorResponse.value = null
    const wrapper = await mountDetailPage()
    expect(wrapper.text()).toMatch(/unavailable|not found|error/i)
  })
})

const QUEUE_ITEMS = [
  {
    version:1,
    id: 'req-1',
    title: 'Autumn Product Summit',
    status: 'SUBMITTED',
    submittedAt: '2026-09-20T07:00:00.000Z',
    coordinatorId: null,
    organiser: { name: 'Priya Nair', company: 'TechCorp' },
    eventName: 'Autumn Product Summit',
    purpose: 'Product launch',
    description: 'Flagship summit.',
    proposedDate: '2026-10-14',
    expectedAttendance: 220,
    startTime: '09:00',
    endTime: '17:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 220,
    preferredLayout: 'theatre',
    venueType: 'physical',
    venueRequirements: 'Riverside Hall',
    accessibilityNeeds: ['wheelchair'],
    accessibilityDetails: '',
    equipmentNeeds: ['projector', 'pa-system'],
    technicalDetails: '',
  },
  {
    version:1,
    id: 'req-2',
    title: 'Vendor Expo 2026',
    status: 'SUBMITTED',
    submittedAt: '2026-09-19T09:00:00.000Z',
    coordinatorId: null,
    organiser: { name: 'Marcus Tan', company: 'Oakview Retail Group' },
    eventName: 'Vendor Expo 2026',
    purpose: 'Trade show',
    description: 'Vendor exposition.',
    proposedDate: '2026-12-05',
    expectedAttendance: 400,
    startTime: '10:00',
    endTime: '18:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 400,
    preferredLayout: 'classroom',
    venueType: 'physical',
    venueRequirements: 'Oakview Pavilion',
    accessibilityNeeds: [],
    accessibilityDetails: '',
    equipmentNeeds: ['projector'],
    technicalDetails: '',
  },
]

async function mountIndexPage() {
  const pageModules = import.meta.glob('../../frontend/app/pages/index.vue')
  const loadIndexPage = pageModules['../../frontend/app/pages/index.vue']
  expect(loadIndexPage, 'index page is not implemented').toBeTypeOf('function')
  const { default: IndexPage } = await loadIndexPage!() as { default: Parameters<typeof mountSuspended>[0] }
  return await mountSuspended(IndexPage)
}

function showQueue() {
  detailMocks.actionFetch.mockReset().mockImplementation(async()=>{if(detailMocks.decisionError.value)throw detailMocks.decisionError.value;return detailMocks.decisionResponse.value})
  detailMocks.sessionUser.value = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }
  detailMocks.queueResponse.value = { requests: QUEUE_ITEMS }
  detailMocks.queueError.value = null
  detailMocks.coordinatorResponse.value = null
  detailMocks.decisionResponse.value = null
  detailMocks.decisionError.value = null
  detailMocks.useFetch.mockReset()
  detailMocks.queueRefresh.mockReset()
}

describe('CS-30 — TC-CS30-09 homepage renders per role', () => {
  it('coordinator sees the review queue, not the organiser dashboard', async () => {
    showQueue()
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('Review queue')
    expect(wrapper.text()).toContain('Autumn Product Summit')
    expect(wrapper.text()).toContain('Vendor Expo 2026')
    expect(wrapper.text()).not.toContain('Your events')
  })

  it('organiser keeps the Your events dashboard', async () => {
    detailMocks.sessionUser.value = { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER' }
    detailMocks.eventResponse.value = { events: [] }
    detailMocks.eventError.value = null
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('Your events')
    expect(wrapper.text()).not.toContain('Review queue')
  })
})

describe('CS-30 — TC-CS30-10 queue selection and detail', () => {
  it('selects the first item by default and switches on click', async () => {
    showQueue()
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('Priya Nair')
    const items = wrapper.findAll('button[data-testid="queue-item"]')
    expect(items.length).toBe(2)
    expect(items[0]!.attributes('aria-current')).toBe('true')
    await items[1]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Marcus Tan')
  })

  it('empty queue shows the empty state', async () => {
    detailMocks.sessionUser.value = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }
    detailMocks.queueResponse.value = { requests: [] }
    detailMocks.queueError.value = null
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toMatch(/no requests awaiting review/i)
  })

  it('failed queue load shows an error', async () => {
    detailMocks.sessionUser.value = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }
    detailMocks.queueResponse.value = null
    detailMocks.queueError.value = new Error('boom')
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toMatch(/unavailable|failed|error/i)
  })
})

describe('CS-30 — TC-CS30-11 coordinator decision actions', () => {
  it('approve posts the decision and reloads the page without removing the row locally', async () => {
    showQueue()
    detailMocks.decisionResponse.value = { id: 'req-1', status: 'APPROVED' }
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    const wrapper = await mountIndexPage()
    try {
      const approves = wrapper.findAll('button').filter(b => b.text() === 'Approve')
      expect(approves.length).toBe(1)
      await approves[0]!.trigger('click')
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))
      const posts = detailMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events/req-1/decision' && (init as { method?: string })?.method === 'POST')
      expect(posts.length).toBe(1)
      expect((posts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ decision: 'approve' })
      expect(reload).toHaveBeenCalledOnce()
      expect(detailMocks.refreshNuxtData).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Autumn Product Summit')
      expect(wrapper.text()).toContain('Vendor Expo 2026')
    }
    finally {
      reload.mockRestore()
    }
  })

  it('captures an amendment reason before posting the decision', async () => {
    showQueue()
    detailMocks.decisionResponse.value = { id: 'req-1', status: 'RETURNED_FOR_AMENDMENT' }
    const wrapper = await mountIndexPage()
    const amendments = wrapper.findAll('button').filter(b => b.text() === 'Ask for amendments')
    expect(amendments.length).toBe(1)
    await amendments[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Reason for amendments')
    const reason = document.body.querySelector('textarea[data-testid="amendment-reason"]')
    expect(reason).not.toBeNull()
    reason!.dispatchEvent(new Event('input', { bubbles: true }))
    reason!.dispatchEvent(new Event('change', { bubbles: true }))
    ;(reason as HTMLTextAreaElement).value = 'Please confirm the final attendance range.'
    reason!.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const confirm = document.body.querySelector('button[data-testid="confirm-amendments"]') as HTMLButtonElement
    expect(confirm).not.toBeNull()
    confirm.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const posts = detailMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events/req-1/decision' && (init as { method?: string })?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect((posts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ decision: 'amendments', reason: 'Please confirm the final attendance range.' })
  })

  it('failed decision shows an error and keeps the queue', async () => {
    showQueue()
    detailMocks.decisionResponse.value = null
    detailMocks.decisionError.value = { statusCode: 409, message: 'Conflict' }
    const wrapper = await mountIndexPage()
    const rejects = wrapper.findAll('button').filter(b => b.text() === 'Reject')
    expect(rejects.length).toBe(1)
    await rejects[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(wrapper.text()).toMatch(/could not record|failed|conflict/i)
    expect(wrapper.text()).toContain('Autumn Product Summit')
  })

  it('shows a disabled Change coordinator action left of Reject', async () => {
    showQueue()
    const wrapper = await mountIndexPage()
    const actions = wrapper.findAll('button').filter(b =>
      ['Approve', 'Ask for amendments', 'Change coordinator', 'Reject'].includes(b.text()),
    )
    expect(actions.map(b => b.text())).toEqual(['Approve', 'Ask for amendments', 'Change coordinator', 'Reject'])
    const change = actions[2]!
    expect(change.attributes('disabled')).not.toBe(undefined)
    expect(change.attributes('title')).toMatch(/not available yet/i)
  })
})
// Replaces the mock seed/API harness; retains owner/contact/queue/decision scope.
describe('CS-30 — TC-CS30-01 persistent coordinator and dashboard integration',()=>{
 it('owner and assigned Coordinator see one saved record, unrelated users are denied',async()=>{const r=await api.call('POST','/api/events',valid);expect(r.status).toBe(201);expect(r.body.coordinatorId).toBe(api.users.coord.id);expect((await api.call('GET','/api/events/'+r.body.id,undefined,'coord')).status).toBe(200);expect((await api.call('GET','/api/events/'+r.body.id,undefined,'other')).status).toBe(403)})
 it('relationship-scoped coordinator contact contains only required profile fields',async()=>{const r=await api.call('POST','/api/events',valid);const c=await api.call('GET',`/api/events/${r.body.id}/coordinator`);expect(c.body).toMatchObject({id:api.users.coord.id,name:'coord Synthetic',email:'coord@example.test'});expect(c.body).not.toHaveProperty('passwordHash');expect((await api.call('GET',`/api/events/${r.body.id}/coordinator`,undefined,'other')).status).toBe(403)})
 it('drafts and their edits appear in owner cards with updated title/date',async()=>{const r=await api.call('POST','/api/events',{...valid,saveAs:'draft'});const saved=await api.call('PUT','/api/events/'+r.body.id,{version:r.body.version,eventName:'Renamed',proposedDate:'2028-12-01'});expect(saved.status).toBe(200);const list=await api.call('GET','/api/events');expect(list.body.events.find((x:any)=>x.id===r.body.id)).toMatchObject({title:'Renamed',status:'DRAFT',meta:expect.stringContaining('Dec 1')});expect((await api.call('GET','/api/events',undefined,'other')).body.events).toEqual([])})
 it('unknown persisted IDs fail without synthesising mock records',async()=>{expect((await api.call('GET','/api/events/e2')).status).toBe(404)})
})
describe('CS-30 — TC-CS30-06 queue authorisation',()=>{
 it('lists submitted assigned requests with limited organiser contact',async()=>{const r=await api.call('POST','/api/events',valid);const q=await api.call('GET','/api/review-queue',undefined,'coord');expect(q.body.requests.some((x:any)=>x.id===r.body.id&&x.organiser.name==='owner Synthetic')).toBe(true)})
 it('rejects Organisers and missing sessions',async()=>{expect((await api.call('GET','/api/review-queue')).status).toBe(403);expect((await api.call('GET','/api/review-queue',undefined,null)).status).toBe(401)})
})
describe('CS-30 — TC-CS30-07 existing decision controls use shared guard',()=>{
 it('approve creates a distinct Planning Event and closes further decisions',async()=>{const r=await api.call('POST','/api/events',valid);const p=`/api/events/${r.body.id}/decision`;const d=await api.call('POST',p,{decision:'approve',version:r.body.version},'coord');expect(d.status).toBe(200);expect(d.body).toMatchObject({status:'APPROVED',eventStatus:'ARRANGEMENT_PENDING',statusLabel:'Planning'});expect(d.body.eventId).not.toBe(r.body.id);expect((await api.call('GET',`/api/events/${r.body.id}`)).body).toMatchObject({eventId:d.body.eventId,eventStatus:'ARRANGEMENT_PENDING'});expect((await api.call('POST',p,{decision:'approve',version:d.body.version},'coord')).status).toBe(409)})
 it('reject and return require comments and return their explanations',async()=>{for(const decision of ['reject','amendments']){const r=await api.call('POST','/api/events',valid);const p=`/api/events/${r.body.id}/decision`;expect((await api.call('POST',p,{decision,version:r.body.version},'coord')).status).toBe(422);const d=await api.call('POST',p,{decision,version:r.body.version,notes:'Explain'},'coord');expect(d.status).toBe(200);expect(d.body.decisionReason).toBe('Explain')}})
 it('owner cannot approve; unknown action and unknown ID keep their error status',async()=>{const r=await api.call('POST','/api/events',valid);expect((await api.call('POST',`/api/events/${r.body.id}/decision`,{decision:'approve',version:r.body.version})).status).toBe(403);expect((await api.call('POST',`/api/events/${r.body.id}/decision`,{decision:'explode',version:r.body.version},'coord')).status).toBe(400);expect((await api.call('POST','/api/events/missing/decision',{decision:'approve',version:1},'coord')).status).toBe(404)})
})
describe('CS-30 — TC-CS30-08 private draft and role-scoped dashboard',()=>{
 it('Coordinator dashboard stays empty and draft reads stay private',async()=>{const r=await api.call('POST','/api/events',{eventName:'Incomplete',saveAs:'draft'});expect((await api.call('GET','/api/events',undefined,'coord')).body.events).toEqual([]);expect((await api.call('GET','/api/events/'+r.body.id,undefined,'coord')).status).toBe(403)})
})
