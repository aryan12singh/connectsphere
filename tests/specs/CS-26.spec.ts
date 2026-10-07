import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createApp, createError, defineEventHandler, readBody, setResponseStatus, toWebHandler } from 'h3'

const fixture = vi.hoisted(() => ({ backend: vi.fn(), signup: vi.fn(), navigate: vi.fn() }))
mockNuxtImport('navigateTo', () => fixture.navigate)
mockNuxtImport('$fetch', () => fixture.signup)
mockNuxtImport('useRuntimeConfig', () => () => ({ authMode: 'live', public: {}, app: { baseURL: '/' } }))
vi.mock('../../frontend/server/utils/backend', async (original) => ({ ...await original<object>(), backendFetch: fixture.backend }))
mockNuxtImport('useFetch', () => async () => ({ data: { value: { minLength: 8, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: true, notEmail: true } } }))
beforeEach(() => { fixture.backend.mockReset(); fixture.signup.mockReset(); fixture.navigate.mockReset(); vi.stubGlobal('$fetch', fixture.signup) })
afterEach(() => vi.unstubAllGlobals())

describe('CS-26 — public signup boundary', () => {
  it('TC-CS26-08 BFF forwards the selected public role and organisation, excluding claimed identity/role lists', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('readBody', readBody)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('setResponseStatus', setResponseStatus)
    vi.stubGlobal('useRuntimeConfig', () => ({ authMode: 'live' }))
    vi.stubGlobal('backendFetch', fixture.backend.mockResolvedValue({ user: { id: 'new', email: 'new@example.test', role: 'EVENT_ORGANISER' } }))
    const { default: handler } = await import('../../frontend/server/api/auth/register.post')
    const app = createApp(); app.use('/api/auth/register', handler)
    const response = await toWebHandler(app)(new Request('http://localhost/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.test', role: 'EVENT_ORGANISER', company: 'Nexus Labs', roles: ['VENUE_STAFF'], organisationId: 'forged', isActive: true }) }))
    expect(response.status).toBe(201)
    expect(fixture.backend.mock.calls[0]?.[2].body).toMatchObject({ role: 'EVENT_ORGANISER', company: 'Nexus Labs' })
    expect(fixture.backend.mock.calls[0]?.[2].body).not.toHaveProperty('roles')
    expect(fixture.backend.mock.calls[0]?.[2].body).not.toHaveProperty('organisationId')
  })
  it('TC-CS26-09 Organiser selection requires an accessible organisation field before signup', async () => {
    const { default: Signup } = await import('../../frontend/app/pages/signup.vue')
    const wrapper = await mountSuspended(Signup)
    expect(wrapper.find('select[aria-label="Account type"]').exists()).toBe(true)
    await wrapper.get('select[aria-label="Account type"]').setValue('EVENT_ORGANISER')
    await wrapper.get('#firstName').setValue('New'); await wrapper.get('#lastName').setValue('Organiser')
    await wrapper.get('#email').setValue('new@example.test'); await wrapper.get('#password').setValue('Strong!1'); await wrapper.get('#confirmPassword').setValue('Strong!1')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Enter your organisation.')
    expect(fixture.signup).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('TC-CS26-05 server duplicate-email guidance appears beside the email field and retains typed input', async () => {
    fixture.signup.mockRejectedValue({ data: { statusCode: 409, statusMessage: 'Account contains invalid fields', data: { error: { fields: { email: ['A user with this email already exists'] } } } } })
    const { default: Signup } = await import('../../frontend/app/pages/signup.vue')
    const wrapper = await mountSuspended(Signup)
    await wrapper.get('#firstName').setValue('New'); await wrapper.get('#lastName').setValue('Attendee')
    await wrapper.get('#email').setValue('duplicate@example.test'); await wrapper.get('#password').setValue('Strong!1'); await wrapper.get('#confirmPassword').setValue('Strong!1')
    await wrapper.get('form').trigger('submit'); await new Promise(resolve => setTimeout(resolve, 0))
    expect(fixture.signup).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.find('#email-error').exists()).toBe(true)
    expect(wrapper.get('#email-error').text()).toBe('A user with this email already exists')
    expect((wrapper.get('#email').element as HTMLInputElement).value).toBe('duplicate@example.test')
    wrapper.unmount()
  })
})

describe('CS-26 — role and effective capability intersection', () => {
  it('TC-CS26-04 all five roles obey the action matrix, including injected and revoked grants', async () => {
    const { hasPermission } = await import('../../services/utils/role-policy.js')
    // Customer action table, independent of the production ACTION_ROLES value.
    const allowed: Record<string, string[]> = {
      EVENT_ORGANISER: ['event_requests.create', 'events.view', 'messages.send'],
      EVENT_COORDINATOR: ['event_requests.review', 'events.confirm', 'events.view', 'messages.send', 'venues.view', 'venue_bookings.create'],
      VENUE_STAFF: ['events.view', 'messages.send', 'venues.view', 'venues.manage', 'venue_bookings.decide'],
      TECHNICAL_SUPPORT_STAFF: ['users.view', 'users.manage', 'permissions.manage', 'settings.manage', 'audit.view', 'events.view', 'messages.send', 'venues.view'],
      ATTENDEE: ['events.view', 'messages.send', 'attendance.register'],
    }
    const actions = [...new Set(Object.values(allowed).flat())]
    for (const [role, permitted] of Object.entries(allowed)) for (const action of actions) {
      expect(hasPermission({ role, roles: [role], permissions: actions }, action), `${role}: ${action}`).toBe(permitted.includes(action))
      expect(hasPermission({ role, roles: [role], permissions: [] }, action), `revoked ${role}: ${action}`).toBe(false)
    }
    expect(hasPermission({ role: 'ATTENDEE', roles: ['ATTENDEE', 'EVENT_ORGANISER'], permissions: ['event_requests.create'] }, 'event_requests.create')).toBe(true)
    for (const roles of [[], ['UNKNOWN'], ['EVENT_ORGANISER', 'UNKNOWN']]) expect(hasPermission({ roles, permissions: actions }, 'event_requests.create')).toBe(false)
  })
})
