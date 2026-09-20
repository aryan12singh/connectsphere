import { describe, expect, it, vi } from 'vitest'
import { createApp, createError, defineEventHandler, getRouterParam, H3Event, readBody, toWebHandler, useSession } from 'h3'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

const entryMocks = vi.hoisted(() => ({
  useFetch: vi.fn(),
  data: { value: { events: [] } as unknown },
  error: { value: null as unknown },
  sessionUser: { value: { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER' } },
  navigateTo: vi.fn(),
  refreshNuxtData: vi.fn(),
}))

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

// CS-11 — single file per story (IS212/IEEE 829). One describe per TC, all TCs together.
// Story: As an Event Organiser, I want to submit my event requirements and view the
// recorded request so that ConnectSphere can begin planning from accurate information.
// Execution log is generated deterministically via tests/scripts/compile-test-run.ts → test-runs/<date-time>.md
//
// RED cycle (TDD, no-skip policy per CS-10 precedent): the BFF event-request
// boundary does not exist yet, so every case below asserts the externally
// observable HTTP contract against the real in-process h3 adapter and fails
// (404) because the behavior is missing — not because of an import/syntax/
// environment error. Cases whose listed contract dependency is not yet agreed
// (C02 matrix, T01, shared activity/assignment boundaries) still assert the
// required observable behavior and fail; they must not become passing
// placeholders, tautologies, or mock-replayed results.

// Figma-derived valid payload (frame 2044:4675), kept independent of implementation.
const VALID_PAYLOAD = {
  eventName: 'Autumn Product Summit',
  purpose: 'Product launch',
  description: 'Annual gathering for customers and partners.',
  proposedDate: '2026-11-20',
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Asia/Singapore',
  expectedAttendance: 200,
  venueType: 'physical',
  minimumCapacity: 220,
  preferredLayout: 'theatre',
  venueRequirements: 'Hall A, near MRT',
  accessibilityNeeds: ['wheelchair'],
  accessibilityDetails: '',
  equipmentNeeds: ['projector'],
  technicalDetails: '',
}

const ORGANISER_COOKIE = 'connectsphere_session=%7B%22userId%22%3A%22u-organiser%22%7D'

function testHandler() {
  return toWebHandler(createApp())
}

async function postEventRequest(body: unknown, cookie = ORGANISER_COOKIE) {
  return await testHandler()(new Request('http://localhost/api/event-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cookie': cookie },
    body: JSON.stringify(body),
  }))
}

describe('CS-11 — TC-CS11-01 form captures every required information category', () => {
  it('accepts the full Figma field set with time zone and venue type surviving round-trip', async () => {
    const response = await postEventRequest(VALID_PAYLOAD)
    expect(response.status).toBe(201)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ stage: 'Submitted' })
    expect(typeof body.id).toBe('string')
  })
})

describe('CS-11 — TC-CS11-02 approved minimum field set submits successfully', () => {
  it('accepts a request with only the Figma-required fields and no optionals', async () => {
    const response = await postEventRequest({
      eventName: 'Autumn Product Summit',
      purpose: 'Product launch',
      proposedDate: '2026-11-20',
      startTime: '09:00',
      endTime: '17:00',
      timeZone: 'Asia/Singapore',
      expectedAttendance: 200,
      venueType: 'physical',
    })
    expect(response.status).toBe(201)
  })
})

describe('CS-11 — TC-CS11-03 every mandatory field is enforced server-side', () => {
  it('rejects a request omitting eventName with a field-keyed error and no side effects', async () => {
    const { eventName: _omitted, ...withoutName } = VALID_PAYLOAD
    const response = await postEventRequest(withoutName)
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/eventName/i)
  })
})

describe('CS-11 — TC-CS11-04 conditional fields enforced only when trigger applies', () => {
  it('rejects OTHER layout without layout details with field-level guidance', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      preferredLayout: 'OTHER',
      venueRequirements: '',
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/layout|venueRequirements/i)
  })

  it('rejects registration enabled without registration details with field-level guidance', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      registrationEnabled: true,
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/regist/i)
  })
})

describe('CS-11 — TC-CS11-05 invalid values receive field-level guidance', () => {
  it('rejects an invalid date and non-positive attendance with field-keyed errors', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      proposedDate: 'not-a-date',
      expectedAttendance: 0,
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    const text = JSON.stringify(body)
    expect(text).toMatch(/proposedDate/i)
    expect(text).toMatch(/expectedAttendance/i)
  })
})

describe('CS-11 — TC-CS11-06 no arbitrary submission lead-time restriction', () => {
  it('accepts both near-future and distant-future proposed dates', async () => {
    const near = await postEventRequest({ ...VALID_PAYLOAD, proposedDate: '2026-09-20' })
    const far = await postEventRequest({ ...VALID_PAYLOAD, proposedDate: '2028-06-01' })
    expect(near.status).toBe(201)
    expect(far.status).toBe(201)
  })
})

describe('CS-11 — TC-CS11-07 successful submission creates one identified Submitted request', () => {
  it('returns a unique request ID, Submitted stage, timestamp and owning organiser', async () => {
    const response = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-07' })
    expect(response.status).toBe(201)
    const body = await response.json() as Record<string, unknown>
    expect(typeof body.id).toBe('string')
    expect(body).toMatchObject({ stage: 'Submitted' })
    expect(typeof body.submittedAt).toBe('string')
  })
})

describe('CS-11 — TC-CS11-08 on-screen confirmation identifies the persisted request', () => {
  it('registers a new-request form route that can render the returned request ID and stage', () => {
    const pageModules = import.meta.glob('../../frontend/app/pages/**/*.vue')
    const hasRequestFormRoute = Object.keys(pageModules).some(p => /request/i.test(p))
    expect(hasRequestFormRoute, 'new-request form route is not registered').toBe(true)
  })
})

describe('CS-11 — TC-CS11-09 owning organiser retrieves current information and stage', () => {
  it('returns the persisted information and current stage to the owner', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ id: 'req-owned' })
  })
})

describe('CS-11 — TC-CS11-10 unrelated user cannot retrieve the request', () => {
  it('denies access without returning request contents', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      headers: { cookie: 'connectsphere_session=%7B%22userId%22%3A%22u-organiser-b%22%7D' },
    }))
    expect(response.status).toBe(403)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/denied|forbidden|unauthori[sz]ed/i)
    expect(body).not.toHaveProperty('request')
    expect(body).not.toHaveProperty('event')
  })
})

describe('CS-11 — TC-CS11-11 unrelated user cannot modify the request', () => {
  it('rejects mutations from a non-owner leaving state unchanged', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': 'connectsphere_session=%7B%22userId%22%3A%22u-organiser-b%22%7D' },
      body: JSON.stringify({ eventName: 'Hijacked' }),
    }))
    expect(response.status).toBe(403)
  })
})

describe('CS-11 — TC-CS11-12 owning organiser cannot modify a Submitted request', () => {
  it('rejects direct mutation of a Submitted request as read-only', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': ORGANISER_COOKIE },
      body: JSON.stringify({ description: 'Changed after submit' }),
    }))
    expect([403, 405]).toContain(response.status)
  })
})

describe('CS-11 — TC-CS11-13 repeating the same operation is idempotent', () => {
  it('returns the same request for identical retries with one operation key', async () => {
    const first = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-13' })
    const second = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-13' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json() as Record<string, unknown>
    const secondBody = await second.json() as Record<string, unknown>
    expect(secondBody.id).toBe(firstBody.id)
  })
})

describe('CS-11 — TC-CS11-14 reusing an operation key for a different payload is rejected', () => {
  it('returns conflict and leaves the original request unchanged', async () => {
    await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-14' })
    const conflict = await postEventRequest({ ...VALID_PAYLOAD, eventName: 'Changed name', operationKey: 'op-cs11-14' })
    expect(conflict.status).toBe(409)
  })
})

describe('CS-11 — TC-CS11-15 successful submission records the shared activity contract', () => {
  it('records exactly one activity with action type, request reference, actor and time', async () => {
    const response = await testHandler()(new Request('http://localhost/api/activities?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    const activities = (body.activities ?? body) as Record<string, unknown>[]
    expect(Array.isArray(activities) ? activities.length : -1).toBe(1)
  })
})

describe('CS-11 — TC-CS11-16 submitted request becomes available for CS-30 assignment once', () => {
  it('exposes one eligible assignment item for the Submitted request', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned/assignment', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/submitted/i)
  })
})

describe('CS-11 — TC-CS11-17 CS-50 submission notification is actually delivered', () => {
  it('delivers one notification with receipt evidence correlating actor, request and message', async () => {
    const submit = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-17' })
    expect(submit.status).toBe(201)
    const receipt = await testHandler()(new Request('http://localhost/api/notifications?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(receipt.status).toBe(200)
    expect(JSON.stringify(await receipt.json())).toMatch(/delivered/i)
  })
})

describe('CS-11 — TC-CS11-18 notification failure retries without repeating submission', () => {
  it('retries delivery per policy with one persisted request and no duplicates', async () => {
    const submit = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-18' })
    expect(submit.status).toBe(201)
    const status = await testHandler()(new Request('http://localhost/api/notifications?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(status.status).toBe(200)
    expect(JSON.stringify(await status.json())).toMatch(/retr/i)
  })
})

describe('CS-11 — TC-CS11-19 CS-11 does not persist incomplete drafts', () => {
  it('rejects incomplete submits with validation only and creates no draft', async () => {
    const response = await postEventRequest({ eventName: 'Partial' })
    expect(response.status).toBe(422)
  })
})

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

// CS-11 — agreed BFF surface is POST/PUT/GET /api/events (single resource;
// supersedes the /api/event-requests paths above, which stay until the
// backend contract lands). Harness: real H3Event + real iron-sealed session.
// NOTE: `cookie` is a forbidden header stripped by `new Request()`, and
// `readBody` needs a parsed body — hence preset `Symbol.for('h3ParsedBody')`.
const BFF_PASSWORD = 'test-session-password-with-32plus-chars-0123456789abcdef'

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

describe('CS-11 — TC-CS11-20 draft and submit create persisted requests', () => {
  it('POST saveAs=submit returns 201 SUBMITTED with an assigned coordinator', async () => {
    stubBffGlobals()
    try {
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const cookie = await sealBffCookie(ORGANISER_USER)
      const body = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'submit' } }).event)
      expect(body.status).toBe('SUBMITTED')
      expect(typeof body.id).toBe('string')
      expect(typeof body.coordinatorId).toBe('string')
      expect(body).not.toHaveProperty('token')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('POST saveAs=draft returns 201 DRAFT without a coordinator', async () => {
    stubBffGlobals()
    try {
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const cookie = await sealBffCookie(ORGANISER_USER)
      const body = await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'draft' } }).event)
      expect(body.status).toBe('DRAFT')
      expect(typeof body.id).toBe('string')
      expect(body.coordinatorId ?? null).toBe(null)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('POST with missing required fields returns 422 field-keyed errors', async () => {
    stubBffGlobals()
    try {
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { proposedDate: _omitted, ...withoutDate } = VALID_FORM
      await expect(postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...withoutDate, saveAs: 'submit' } }).event))
        .rejects.toMatchObject({ statusCode: 422 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('POST without a session is denied 401', async () => {
    stubBffGlobals()
    try {
      const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(postHandler(mockBffEvent({ method: 'POST', body: { ...VALID_FORM, saveAs: 'draft' } }).event))
        .rejects.toMatchObject({ statusCode: 401 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-11 — TC-CS11-21 drafts submit and edit through PUT', () => {
  async function createDraft(cookie: string) {
    const { default: postHandler } = await import('../../frontend/server/api/events.post') as unknown as {
      default: (event: never) => Promise<Record<string, unknown>>
    }
    return await postHandler(mockBffEvent({ cookie, method: 'POST', body: { ...VALID_FORM, saveAs: 'draft' } }).event)
  }

  it('PUT submit=true on a draft returns 200 SUBMITTED with a coordinator', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const draft = await createDraft(cookie)
      const { default: putHandler } = await import('../../frontend/server/api/events/[id].put') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await putHandler(mockBffEvent({ cookie, method: 'PUT', params: { id: draft.id as string }, body: { ...VALID_FORM, submit: true } }).event)
      expect(body.status).toBe('SUBMITTED')
      expect(typeof body.coordinatorId).toBe('string')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('PUT edit-save on a draft keeps DRAFT with updated fields', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const draft = await createDraft(cookie)
      const { default: putHandler } = await import('../../frontend/server/api/events/[id].put') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      const body = await putHandler(mockBffEvent({ cookie, method: 'PUT', params: { id: draft.id as string }, body: { ...VALID_FORM, eventName: 'Renamed Summit' } }).event)
      expect(body.status).toBe('DRAFT')
      expect(body.eventName).toBe('Renamed Summit')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('PUT from another organiser is denied 403 without changes', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const draft = await createDraft(cookie)
      const otherCookie = await sealBffCookie({ id: 'u-organiser-b', email: 'b@example.com', name: 'B', role: 'EVENT_ORGANISER' })
      const { default: putHandler } = await import('../../frontend/server/api/events/[id].put') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(putHandler(mockBffEvent({ cookie: otherCookie, method: 'PUT', params: { id: draft.id as string }, body: { ...VALID_FORM, eventName: 'Hijacked' } }).event))
        .rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('PUT on an unknown id returns 404', async () => {
    stubBffGlobals()
    try {
      const cookie = await sealBffCookie(ORGANISER_USER)
      const { default: putHandler } = await import('../../frontend/server/api/events/[id].put') as unknown as {
        default: (event: never) => Promise<Record<string, unknown>>
      }
      await expect(putHandler(mockBffEvent({ cookie, method: 'PUT', params: { id: 'nope' }, body: { ...VALID_FORM } }).event))
        .rejects.toMatchObject({ statusCode: 404 })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-11 — TC-CS11-22 create-form submit returns home refreshed', () => {
  async function fillAndSubmit(saveAction: 'draft' | 'submit') {
    const wrapper = await mountNewRequestPage()
    await wrapper.get('#event-name').setValue('Autumn Product Summit')
    await wrapper.get('#purpose').setValue('Product launch')
    await wrapper.get('#proposed-date').setValue('2026-11-20')
    await wrapper.get('#expected-attendance').setValue(200)
    await wrapper.get('#start-time').setValue('09:00')
    await wrapper.get('#end-time').setValue('17:00')
    await wrapper.get('#time-zone').setValue('Asia/Singapore')
    await wrapper.get('#venue-type').setValue('physical')
    if (saveAction === 'draft') {
      const buttons = wrapper.findAll('button').filter(b => b.text().includes('Save draft'))
      expect(buttons.length > 0, 'save-draft button is not rendered').toBe(true)
      await buttons[0]!.trigger('click')
    }
    else {
      await wrapper.get('#request-form').trigger('submit')
    }
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    return wrapper
  }

  it('Submit request POSTs saveAs=submit then refreshes and lands on /', async () => {
    entryMocks.useFetch.mockReset()
    entryMocks.navigateTo.mockReset()
    entryMocks.refreshNuxtData.mockReset()
    entryMocks.data.value = { id: 'req-1', status: 'SUBMITTED' }
    entryMocks.error.value = null
    const wrapper = await fillAndSubmit('submit')
    const posts = entryMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events' && (init as { method?: string })?.method === 'POST')
    expect(posts.length).toBe(1)
    expect((posts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ saveAs: 'submit', eventName: 'Autumn Product Summit' })
    expect(entryMocks.refreshNuxtData).toHaveBeenCalledWith('organiser-events')
    expect(entryMocks.navigateTo).toHaveBeenCalledWith('/')
    expect(wrapper.text()).not.toMatch(/failed|invalid/i)
  })

  it('Save draft POSTs saveAs=draft then refreshes and lands on /', async () => {
    entryMocks.useFetch.mockReset()
    entryMocks.navigateTo.mockReset()
    entryMocks.refreshNuxtData.mockReset()
    entryMocks.data.value = { id: 'req-2', status: 'DRAFT' }
    entryMocks.error.value = null
    await fillAndSubmit('draft')
    const posts = entryMocks.useFetch.mock.calls.filter(([url, init]) => url === '/api/events' && (init as { method?: string })?.method === 'POST')
    expect(posts.length).toBe(1)
    expect((posts[0]![1] as { body?: Record<string, unknown> }).body).toMatchObject({ saveAs: 'draft' })
    expect(entryMocks.navigateTo).toHaveBeenCalledWith('/')
  })

  it('failed submit shows an error and stays on the form', async () => {
    entryMocks.useFetch.mockReset()
    entryMocks.navigateTo.mockReset()
    entryMocks.data.value = null
    entryMocks.error.value = { message: 'Validation failed' }
    const wrapper = await fillAndSubmit('submit')
    expect(wrapper.text()).toMatch(/could not save|failed|invalid/i)
    expect(entryMocks.navigateTo).not.toHaveBeenCalledWith('/')
  })
})
