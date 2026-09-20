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
  navigateTo: vi.fn(),
  refreshNuxtData: vi.fn(),
}))

mockNuxtImport('useFetch', () => (url: unknown, init?: { method?: string }) => {
  detailMocks.useFetch(url, init)
  if (typeof url === 'string' && url.startsWith('/api/users/'))
    return { data: detailMocks.coordinatorResponse, error: { value: null } }
  if ((init as { method?: string } | undefined)?.method === 'PUT')
    return { data: detailMocks.putResponse, error: detailMocks.putError }
  return { data: detailMocks.eventResponse, error: detailMocks.eventError }
})
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
