import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'

// CS-95 UAT items for Technical Support (Hafiz):
// 1. The top menu hid "Preparation" from Technical Support, although the page lets them in.
// 2. A mistyped technical request address (e.g. /technical-requirements/preparations) showed an
//    empty read-only form instead of saying the request was not found.
const fixture = vi.hoisted(() => ({
  user: { value: null as Record<string, unknown> | null },
  requestError: null as unknown,
}))

const sessionUser = (role: string, permissions: string[]) => ({ id: `${role.toLowerCase()}-1`, role, roles: [role], permissions })

mockNuxtImport('useUserSession', () => () => ({ user: fixture.user, fetch: vi.fn(), clear: vi.fn() }))
mockNuxtImport('useRoute', () => () => ({ path: '/technical-requirements/preparations', params: { id: 'preparations' }, query: {} }))
mockNuxtImport('useFetch', () => (path: unknown) => {
  const url = String(typeof path === 'function' ? path() : path)
  if (url === '/api/technical-equipment-types') return { data: ref({ equipmentTypes: [{ id: 'projector', name: 'projector' }] }), error: ref(null), refresh: vi.fn() }
  if (url === '/api/venues') return { data: ref({ items: [] }), error: ref(null), refresh: vi.fn() }
  if (url.endsWith('/technical-request')) return { data: ref(null), error: ref(fixture.requestError), refresh: vi.fn() }
  return { data: ref(null), error: ref(null), refresh: vi.fn() }
})

async function mountLayout() {
  const { default: DefaultLayout } = await import('../../frontend/app/layouts/default.vue')
  return await mountSuspended(DefaultLayout)
}

async function mountRequestPage() {
  const { default: RequestPage } = await import('../../frontend/app/pages/technical-requirements/[id].vue')
  return await mountSuspended(RequestPage)
}

const preparationLinks = (wrapper: Awaited<ReturnType<typeof mountLayout>>) =>
  wrapper.findAll('a[href="/technical-requirements/preparation"]').filter(link => link.text() === 'Preparation')

describe('CS-95 Staff preparation navigation', () => {
  it('shows the Preparation menu link to Technical Support', async () => {
    fixture.user.value = sessionUser('TECHNICAL_SUPPORT_STAFF', ['technical.review', 'technical.view', 'venues.view'])
    const wrapper = await mountLayout()
    expect(preparationLinks(wrapper)).toHaveLength(1)
    wrapper.unmount()
  })

  it('still shows it to Venue Staff and hides it from roles without preparation access', async () => {
    fixture.user.value = sessionUser('VENUE_STAFF', ['venue_bookings.decide', 'venues.view'])
    const venue = await mountLayout()
    expect(preparationLinks(venue)).toHaveLength(1)
    venue.unmount()
    fixture.user.value = sessionUser('ATTENDEE', ['events.view'])
    const attendee = await mountLayout()
    expect(preparationLinks(attendee)).toHaveLength(0)
    attendee.unmount()
  })
})

describe('CS-95 unknown technical request address', () => {
  it('tells Technical Support the request was not found instead of showing an empty form', async () => {
    fixture.user.value = sessionUser('TECHNICAL_SUPPORT_STAFF', ['technical.review', 'technical.view'])
    fixture.requestError = { statusCode: 404, statusMessage: 'Technical request not found.' }
    const wrapper = await mountRequestPage()
    expect(wrapper.get('[role="alert"]').text()).toContain('Technical request not found.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('a[href="/technical-requirements"]').text()).toContain('Back to Technical Review')
    expect(wrapper.find('a[href="/requests/preparations"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('tells the Coordinator when the Event itself does not exist', async () => {
    fixture.user.value = sessionUser('EVENT_COORDINATOR', ['events.view'])
    fixture.requestError = { statusCode: 404, data: { error: true, statusCode: 404, data: { error: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' } } } }
    const wrapper = await mountRequestPage()
    expect(wrapper.get('[role="alert"]').text()).toContain('Event not found.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('a[href="/"]').text()).toContain('Back to Events')
    wrapper.unmount()
  })

  it('keeps the empty form for the Coordinator on a real Event with no request yet', async () => {
    fixture.user.value = sessionUser('EVENT_COORDINATOR', ['events.view'])
    fixture.requestError = { statusCode: 404, statusMessage: 'Technical request not found.' }
    const wrapper = await mountRequestPage()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Technical request not found.')
    wrapper.unmount()
  })
})
