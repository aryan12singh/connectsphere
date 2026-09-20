import { describe, expect, it, vi } from 'vitest'
import { createError, defineEventHandler, getRouterParam, H3Event, readBody, useSession } from 'h3'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

// CS-30 — single file per story (IS212/IEEE 829). Organiser-visible slice
// (Phase A): current coordinator banner, secure owner view, reusable edit
// form. Execution log via tests/scripts/compile-test-run.ts → test-runs/.

const detailMocks = vi.hoisted(() => ({
  useFetch: vi.fn(),
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

mockNuxtImport('useFetch', () => (url: unknown, init?: { method?: string }) => {
  detailMocks.useFetch(url, init)
  if (typeof url === 'string' && url.startsWith('/api/users/'))
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

// Boundary harness: real H3Event + real iron-sealed session (same pattern as
// CS-11 agreed-surface tests). `cookie` is a forbidden header stripped by
// `new Request()`; `readBody` needs preset `Symbol.for('h3ParsedBody')`.
const BFF_PASSWORD = 'test-session-password-with-32plus-chars-0123456789abcdef'

const ORGANISER_USER = { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER' }

const VALID_FORM = {
  eventName: 'Autumn Product Summit',
  purpose: 'Product launch',
  description: 'Annual gathering for customers and partners.',
  proposedDate: '2026-11-20',
  expectedAttendance: 200,
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Asia/Singapore',
  venueType: 'physical',
  minimumCapacity: 220,
  preferredLayout: 'theatre',
  venueRequirements: 'Hall A, near MRT',
  accessibilityNeeds: ['wheelchair'],
  accessibilityDetails: '',
  equipmentNeeds: ['projector'],
  technicalDetails: '',
}

function mockBffEvent(opts: { cookie?: string, method?: string, body?: unknown, params?: Record<string, string> }) {
  const resHeaders = new Map<string, string | string[]>()
  const nodeReq: Record<string | symbol, unknown> = {
    method: opts.method ?? 'GET',
    headers: { host: 'localhost', 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
  }
  if (opts.body !== undefined)
    nodeReq[Symbol.for('h3ParsedBody')] = opts.body
  const nodeRes = {
    getHeader: (name: string) => resHeaders.get(name),
    setHeader: (name: string, value: string | string[]) => { resHeaders.set(name, value) },
    removeHeader: (name: string) => { resHeaders.delete(name) },
    appendHeader: (name: string, value: string) => { resHeaders.set(name, value) },
  }
  const event = new H3Event(nodeReq, nodeRes) as unknown as Parameters<typeof useSession>[0] & { context: { params?: Record<string, string> } }
  if (opts.params)
    event.context.params = opts.params
  return { event, resHeaders }
}

async function sealBffCookie(user: Record<string, unknown>) {
  const sealer = mockBffEvent({})
  const session = await useSession(sealer.event, { password: BFF_PASSWORD, name: 'nuxt-session' })
  await session.update({ user })
  const raw = sealer.resHeaders.get('set-cookie')
  return ((Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').split(';')[0] ?? '')
}

function stubBffGlobals() {
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('readBody', readBody)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('getRouterParam', getRouterParam)
  vi.stubGlobal('requireUserSession', async (event: Parameters<typeof useSession>[0]) => {
    const session = await useSession(event, { password: BFF_PASSWORD, name: 'nuxt-session' })
    if (!session.data.user)
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    return session.data
  })
}

const SUBMITTED_EVENT = {  id: 'req-1',
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
  detailMocks.eventResponse.value = SUBMITTED_EVENT
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

describe('CS-30 — TC-CS30-03 submitted request is read-only until edit is chosen', () => {
  it('renders disabled fields with an Edit action', async () => {
    showSubmittedWithCoordinator()
    const wrapper = await mountDetailPage()
    expect(wrapper.find('fieldset[disabled]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Edit request')
  })

  it('edit mode enables the reusable form and saves through PUT', async () => {
    showSubmittedWithCoordinator()
    detailMocks.putResponse.value = { ...SUBMITTED_EVENT, eventName: 'Renamed Summit' }
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
    const puts = detailMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events/req-1' && (init as { method?: string })?.method === 'PUT')
    expect(puts.length).toBe(1)
    expect((puts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ eventName: 'Renamed Summit' })
    expect(detailMocks.refreshNuxtData).toHaveBeenCalledWith('organiser-events')
    expect(detailMocks.navigateTo).toHaveBeenCalledWith('/')
  })
})

describe('CS-30 — TC-CS30-04 draft opens editable with submit available', () => {
  it('draft shows enabled fields and submits through PUT submit=true', async () => {
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
    const puts = detailMocks.useFetch.mock.calls.filter(([url, init]) => typeof url === 'string' && url.startsWith('/api/events/') && (init as { method?: string })?.method === 'PUT')
    expect(puts.length).toBe(1)
    expect((puts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ submit: true })
    expect(detailMocks.navigateTo).toHaveBeenCalledWith('/')
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

describe('CS-30 — TC-CS30-01 organiser reads the submitted request with its coordinator', () => {
  it('GET owner view returns fields plus coordinatorId after submit', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const created = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'submit' } }).event)
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await getHandler(mockBffEvent({ cookie, params: { id: created.id as string } }).event)
      expect(body).toMatchObject({ id: created.id, eventName: 'Autumn Product Summit', status: 'SUBMITTED' })
      expect(typeof body.coordinatorId).toBe('string')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET from another organiser is denied 403 without contents', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const created = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'submit' } }).event)
      const otherCookie = await sealBffCookie({ id: 'u-organiser-b', email: 'b@example.com', name: 'B', role: 'EVENT_ORGANISER' })
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(getHandler(mockBffEvent({ cookie: otherCookie, params: { id: created.id as string } }).event))
        .rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET users/:id returns the BFF profile view without secrets', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: usersHandler } = await import('../../frontend/server/api/users/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await usersHandler(mockBffEvent({ cookie, params: { id: 'u-coordinator' } }).event)
      expect(body).toMatchObject({ id: 'u-coordinator', role: 'EVENT_COORDINATOR' })
      expect(typeof (body as { email?: unknown }).email).toBe('string')
      expect(body).not.toHaveProperty('passwordHash')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET resolves dashboard seed ids for the owning organiser', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await getHandler(mockBffEvent({ cookie, params: { id: 'e1' } }).event)
      expect(body).toMatchObject({
        id: 'e1',
        eventName: 'Product Summit Launch',
        status: 'DRAFT',
        proposedDate: '2026-11-20',
        expectedAttendance: 300,
        venueRequirements: 'Riverside Hall',
      })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET seeded submitted request carries its coordinator', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await getHandler(mockBffEvent({ cookie, params: { id: 'e2' } }).event)
      expect(body).toMatchObject({ id: 'e2', status: 'SUBMITTED', coordinatorId: 'u-coordinator' })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('dashboard list meta reflects the underlying record data', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: listHandler } = await import('../../frontend/server/api/events.get') as unknown as {
        default: (event: never) => Promise<{ events: Record<string, unknown>[] }>
      }
      const body = await listHandler(mockBffEvent({ cookie }).event)
      const first = body.events.find(event => event.id === 'e1')
      expect(first).toMatchObject({ title: 'Product Summit Launch', status: 'DRAFT' })
      expect(String(first?.meta)).toContain('Riverside Hall')
      expect(String(first?.meta)).toContain('300')
      expect(String(first?.meta)).toContain('Nov 20')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('created drafts appear in the dashboard list', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const created = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, eventName: 'List Visibility Check', saveAs: 'draft' } }).event)
      const { default: listHandler } = await import('../../frontend/server/api/events.get') as unknown as {
        default: (event: never) => Promise<{ events: Record<string, unknown>[] }>
      }
      const body = await listHandler(mockBffEvent({ cookie }).event)
      const found = body.events.find(event => event.id === created.id)
      expect(found).toMatchObject({ title: 'List Visibility Check', status: 'DRAFT' })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('edited details update the dashboard card title and meta', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const created = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'draft' } }).event)
      const { default: putHandler } = await import('../../frontend/server/api/events/[id].put') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await putHandler(mockBffEvent({ cookie, method: 'PUT', params: { id: created.id as string }, body: { ...VALID_FORM, eventName: 'Renamed For List', venueRequirements: 'New Venue Hall' } }).event)
      const { default: listHandler } = await import('../../frontend/server/api/events.get') as unknown as {
        default: (event: never) => Promise<{ events: Record<string, unknown>[] }>
      }
      const body = await listHandler(mockBffEvent({ cookie }).event)
      const found = body.events.find(event => event.id === created.id)
      expect(found).toMatchObject({ title: 'Renamed For List' })
      expect(String(found?.meta)).toContain('New Venue Hall')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET seed id from another organiser is denied 403', async () => {
    stubBffGlobals()
    try {
      const otherCookie = await sealBffCookie({ id: 'u-organiser-b', email: 'b@example.com', name: 'B', role: 'EVENT_ORGANISER' })
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(getHandler(mockBffEvent({ cookie: otherCookie, params: { id: 'e1' } }).event))
        .rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-30 — TC-CS30-06 edit actions follow request status', () => {
  it('draft offers save and submit as two actions', async () => {
    detailMocks.eventResponse.value = { ...SUBMITTED_EVENT, id: 'req-2', status: 'DRAFT', coordinatorId: null, submittedAt: null }
    detailMocks.eventError.value = null
    detailMocks.coordinatorResponse.value = null
    detailMocks.putResponse.value = { id: 'req-2', status: 'DRAFT' }
    detailMocks.putError.value = null
    detailMocks.useFetch.mockReset()
    detailMocks.navigateTo.mockReset()
    const wrapper = await mountDetailPage()
    const saves = wrapper.findAll('button').filter(b => b.text().includes('Save changes'))
    const submits = wrapper.findAll('button').filter(b => b.text().includes('Submit request'))
    expect(saves.length).toBe(1)
    expect(submits.length).toBe(1)
    await saves[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    const puts = detailMocks.useFetch.mock.calls.filter(([url, init]) => typeof url === 'string' && url.startsWith('/api/events/') && (init as { method?: string })?.method === 'PUT')
    expect(puts.length).toBe(1)
    expect((puts[0]![1] as { body?: Record<string, unknown> }).body).not.toMatchObject({ submit: true })
    expect(detailMocks.navigateTo).toHaveBeenCalledWith('/')
  })

  it('submitted offers one combined save-and-submit action', async () => {
    showSubmittedWithCoordinator()
    const wrapper = await mountDetailPage()
    const edits = wrapper.findAll('button').filter(b => b.text().includes('Edit request'))
    expect(edits.length).toBe(1)
    await edits[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    const actions = wrapper.findAll('button').filter(b => b.text().includes('Save and Submit'))
    expect(actions.length).toBe(1)
    expect(wrapper.findAll('button').filter(b => b.text().includes('Submit request')).length).toBe(0)
  })

  it('rejected offers no edit action', async () => {
    detailMocks.eventResponse.value = { ...SUBMITTED_EVENT, id: 'req-9', status: 'REJECTED', coordinatorId: null }
    detailMocks.eventError.value = null
    detailMocks.coordinatorResponse.value = null
    const wrapper = await mountDetailPage()
    expect(wrapper.findAll('button').filter(b => b.text().includes('Edit request')).length).toBe(0)
    expect(wrapper.find('fieldset[disabled]').exists()).toBe(true)
  })
})

const COORDINATOR_USER = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }

describe('CS-30 — TC-CS30-06 review queue is coordinator-only', () => {
  it('GET returns submitted requests with organiser contact for coordinators', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(COORDINATOR_USER)
      const { default: queueHandler } = await import('../../frontend/server/api/review-queue.get') as unknown as {
        default: (event: never) => Promise<{ requests: Record<string, unknown>[] }>
      }
      const body = await queueHandler(mockBffEvent({ cookie }).event)
      expect(body.requests.length > 0).toBe(true)
      expect(body.requests.every(item => item.status === 'SUBMITTED')).toBe(true)
      const first = body.requests[0]!
      expect(first).toHaveProperty('id')
      expect(first).toHaveProperty('title')
      expect(first).toMatchObject({ organiser: { name: expect.any(String) } })
      expect(typeof first.submittedAt).toBe('string')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET denies organisers with 403', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: queueHandler } = await import('../../frontend/server/api/review-queue.get') as unknown as {
        default: (event: never) => Promise<unknown>
      }
      await expect(queueHandler(mockBffEvent({ cookie }).event)).rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('GET denies unauthenticated callers with 401', async () => {
    stubBffGlobals()
    try {
      const { default: queueHandler } = await import('../../frontend/server/api/review-queue.get') as unknown as {
        default: (event: never) => Promise<unknown>
      }
      await expect(queueHandler(mockBffEvent({}).event)).rejects.toMatchObject({ statusCode: 401 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-30 — TC-CS30-07 coordinator decisions transition submitted requests', () => {
  it('approve moves SUBMITTED to APPROVED', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(COORDINATOR_USER)
      const { default: decideHandler } = await import('../../frontend/server/api/events/[id]/decision.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await decideHandler(mockBffEvent({ cookie, method: 'POST', params: { id: 'e2' }, body: { decision: 'approve' } }).event)
      expect(body).toMatchObject({ id: 'e2', status: 'APPROVED' })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('reject and amendments transitions apply', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(COORDINATOR_USER)
      const { default: decideHandler } = await import('../../frontend/server/api/events/[id]/decision.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const rejected = await decideHandler(mockBffEvent({ cookie, method: 'POST', params: { id: 'e4' }, body: { decision: 'reject' } }).event)
      expect(rejected).toMatchObject({ status: 'REJECTED' })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('organisers cannot decide (403), unknown decisions 422, unknown ids 404', async () => {
    stubBffGlobals()
    try {
      const orgCookie = await sealBffCookie(ORGANISER_USER)
      const coordCookie = await sealBffCookie(COORDINATOR_USER)
      const { default: decideHandler } = await import('../../frontend/server/api/events/[id]/decision.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(decideHandler(mockBffEvent({ cookie: orgCookie, method: 'POST', params: { id: 'e2' }, body: { decision: 'approve' } }).event))
        .rejects.toMatchObject({ statusCode: 403 })
      await expect(decideHandler(mockBffEvent({ cookie: coordCookie, method: 'POST', params: { id: 'e2' }, body: { decision: 'explode' } }).event))
        .rejects.toMatchObject({ statusCode: 422 })
      await expect(decideHandler(mockBffEvent({ cookie: coordCookie, method: 'POST', params: { id: 'nope' }, body: { decision: 'approve' } }).event))
        .rejects.toMatchObject({ statusCode: 404 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('deciding a non-submitted request conflicts with 409', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(COORDINATOR_USER)
      const { default: decideHandler } = await import('../../frontend/server/api/events/[id]/decision.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(decideHandler(mockBffEvent({ cookie, method: 'POST', params: { id: 'e1' }, body: { decision: 'approve' } }).event))
        .rejects.toMatchObject({ statusCode: 409 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-30 — TC-CS30-08 role scoping on reads', () => {
  it('coordinator sees an empty organiser list; organisers see only their own', async () => {
    stubBffGlobals()
    try {
      const coordCookie = await sealBffCookie(COORDINATOR_USER)
      const otherCookie = await sealBffCookie({ id: 'u-organiser-b', email: 'b@example.com', name: 'B', role: 'EVENT_ORGANISER' })
      const { default: listHandler } = await import('../../frontend/server/api/events.get') as unknown as {
        default: (event: never) => Promise<{ events: Record<string, unknown>[] }>
      }
      const coordBody = await listHandler(mockBffEvent({ cookie: coordCookie }).event)
      expect(coordBody.events).toEqual([])
      const otherBody = await listHandler(mockBffEvent({ cookie: otherCookie }).event)
      expect(otherBody.events).toEqual([])
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('assigned coordinator reads submitted details; drafts stay owner-only', async () => {
    stubBffGlobals()
    try {
      const orgCookie = await sealBffCookie(ORGANISER_USER)
      const coordCookie = await sealBffCookie(COORDINATOR_USER)
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const created = await postHandler(mockBffEvent({ cookie: orgCookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'submit' } }).event)
      const { default: getHandler } = await import('../../frontend/server/api/events/[id].get') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await getHandler(mockBffEvent({ cookie: coordCookie, params: { id: created.id as string } }).event)
      expect(body).toMatchObject({ id: created.id, status: 'SUBMITTED' })
      expect(typeof body.coordinatorId).toBe('string')
      await expect(getHandler(mockBffEvent({ cookie: coordCookie, params: { id: 'e1' } }).event))
        .rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

const QUEUE_ITEMS = [
  {
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
  it('approve posts the decision, drops the row at once and refreshes', async () => {
    showQueue()
    detailMocks.decisionResponse.value = { id: 'req-1', status: 'APPROVED' }
    const wrapper = await mountIndexPage()
    const approves = wrapper.findAll('button').filter(b => b.text() === 'Approve')
    expect(approves.length).toBe(1)
    await approves[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    const posts = detailMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events/req-1/decision' && (init as { method?: string })?.method === 'POST')
    expect(posts.length).toBe(1)
    expect((posts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ decision: 'approve' })
    expect(detailMocks.refreshNuxtData).toHaveBeenCalledWith('coordinator-queue')
    expect(wrapper.text()).not.toContain('Autumn Product Summit')
    expect(wrapper.text()).toContain('Vendor Expo 2026')
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
})
