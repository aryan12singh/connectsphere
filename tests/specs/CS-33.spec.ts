import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, ref } from 'vue'
const venueUi = vi.hoisted(() => ({ history: [] as any[], historyResponses: [] as any[] }))
mockNuxtImport('useUserSession', () => () => ({ user: ref({ id: 'staff', role: 'VENUE_STAFF', roles: ['VENUE_STAFF'], permissions: ['venues.view', 'venues.manage', 'venue_bookings.decide'] }) }))
mockNuxtImport('useFetch', () => async (path: any) => {
  const { ref } = await import('vue')
  const url = typeof path === 'function' ? path() : String(path)
  const data = ref({ items: url.includes('/history/combined') ? venueUi.history : [] })
  if (url.includes('/history/combined')) venueUi.historyResponses.push(data)
  return { data, error: ref(null), refresh: vi.fn() }
})
const toastError = vi.hoisted(() => vi.fn())
vi.mock('vue-sonner', () => ({ toast: { error: toastError } }))
import { MOCK_ROLE_PERMISSIONS } from '../../frontend/server/utils/mockPermissions'
import VenueForm from '../../frontend/app/components/venue/VenueForm.vue'
import VenueWorkspace from '../../frontend/app/components/venue/VenueWorkspace.vue'
import VenueDetails from '../../frontend/app/components/venue/VenueDetails.vue'
import { apiErrorMessage } from '../../frontend/app/components/shared/api-error'
import { applyOperatingSchedule, createVenueForm, operatingSchedule, venuePayload } from '../../frontend/app/components/venue/venue-form-state'
import { venueSaveFailure } from '../../frontend/app/components/venue/venue-save-error'
import { useErrorAlert } from '../../frontend/app/composables/useErrorAlert'

process.env.DATA_MODE = 'memory'
process.env.NODE_ENV = 'test'
const require = createRequire(import.meta.url)
const { validateVenue } = require('../../services/venue-service/src/validation') as { validateVenue: (body: Record<string, unknown>) => Record<string, string[]> }
const { blockingBookingCount } = require('../../services/venue-service/src/bookingClient') as { blockingBookingCount: (venueId: string) => Promise<number> }

function physicalVenue(overrides: Record<string, unknown> = {}) {
  return { name: 'Marina Convention Centre', address: '1 Bayfront Avenue, Singapore', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: ['PROJECTOR'], accessibilityTags: ['WHEELCHAIR_ACCESS'], timeZone: 'Asia/Singapore', managedById: 'venue-staff-1', reason: 'Venue review', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '17:00' }], ...overrides }
}

afterEach(() => { venueUi.history = []; venueUi.historyResponses = [] })

describe('CS-33 — venue records', () => {
  it.each([
    { statusCode: 422, data: { data: { error: { fields: { timeZone: ['Use a valid time zone'] } } } } },
    { status: 422, data: { error: { fields: { timeZone: ['Use a valid time zone'] } } } },
    { data: { statusCode: 422, error: { fields: { timeZone: ['Use a valid time zone'] } } } },
    { statusCode: 422, error: { fields: { timeZone: ['Use a valid time zone'] } } },
  ])('TC-CS33-16 keeps usable 422 field guidance in the form without a duplicate blocking toast (%j)', error => {
    expect(venueSaveFailure(error, 'Could not save this venue.')).toEqual({ fields: { timeZone: ['Use a valid time zone'] }, notify: false })
  })
  it('TC-CS33-16 ignores unusable field messages and keeps malformed validation and generic failures visible', () => {
    const fallback = 'Could not save this venue.'
    const unusable = { empty: [], blank: ['  '], scalar: 'Use a value', numeric: [7], absent: [null] }
    for (const error of [
      { statusCode: 422, data: { error: { fields: unusable } } },
      { statusCode: 422, data: { error: { fields: [] } } },
      { statusCode: 422, data: { error: { fields: null } } },
      { statusCode: 422 },
      { statusCode: 403 },
      { statusCode: 409 },
      { statusCode: 503 },
      new Error('Network unavailable'),
      null,
    ]) expect(venueSaveFailure(error, fallback)).toEqual({ fields: { form: [fallback] }, notify: true })
    for (const statusCode of [403, 409, 503, undefined]) {
      expect(venueSaveFailure({ statusCode, data: { error: { fields: { version: ['Reload before saving'] } } } }, fallback))
        .toEqual({ fields: { version: ['Reload before saving'] }, notify: true })
    }
    expect(venueSaveFailure({ statusCode: 422, data: { error: { fields: { ...unusable, name: ['Venue name required'] } } } }, fallback))
      .toEqual({ fields: { name: ['Venue name required'] }, notify: false })
  })
  it('TC-CS33-16 shows all uncovered field guidance in an in-flow alert after the reason popover closes without losing entered values', async () => {
    const errors = {
      name: ['Choose a venue name'], venueType: ['Select a venue type'], supportedLayouts: ['Check supported layouts'],
      facilities: ['Check facilities'], accessibilityTags: ['Check accessibility'], managedById: ['Choose the responsible Staff'],
      'operatingHours.0.time': ['Closing time must be after opening time'], reason: ['Record the change reason'],
      'metadata.code': ['Review the catalogue reference'], timeZone: ['Use a valid time zone', 'Keep the venue schedule in its own local time zone'],
    }
    const wrapper = mount(VenueForm, { props: { venue: physicalVenue() }, attachTo: document.body })
    try {
      await wrapper.get('#venue-name').setValue('My corrected venue')
      await wrapper.get('#venue-time-zone').setValue('Asia/Singapor')
      await wrapper.setProps({ errors })
      const guidance = wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(' ')
      for (const messages of Object.values(errors)) for (const message of messages) expect(guidance).toContain(message)
      expect((wrapper.get('#venue-name').element as HTMLInputElement).value).toBe('My corrected venue')
      expect((wrapper.get('#venue-time-zone').element as HTMLInputElement).value).toBe('Asia/Singapor')
      expect(wrapper.find('#venue-reason').exists()).toBe(false)
      expect(wrapper.get('#venue-time-zone-error').text()).toBe(errors.timeZone[0])
      await wrapper.setProps({ errors: null })
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
      expect((wrapper.get('#venue-name').element as HTMLInputElement).value).toBe('My corrected venue')
    } finally { wrapper.unmount() }
  })
  it('TC-CS33-14 pages actual venue results, bounds navigation and resets or clamps after search/data changes without changing the selected room', async () => {
    const venues = Array.from({ length: 13 }, (_, index) => ({ id: `room-${index + 1}`, name: `Hall ${String(index + 1).padStart(2, '0')}` }))
    const Calendar = defineComponent({ props: ['venueId', 'canDecide'], template: '<div data-calendar-venue>{{ venueId }} / {{ canDecide }}</div>' })
    const wrapper = await mountSuspended(VenueWorkspace, { props: { venues }, global: { stubs: { VenueCalendar: Calendar, VenueDetails: true, VenueBookingRequests: true, VenueConflicts: true } } })
    const venueNames = () => wrapper.findAll('aside button').filter(button => button.text().startsWith('Hall ')).map(button => button.text().split('Active')[0].trim())
    const previous = () => wrapper.get('nav[aria-label="Venue pages"]').findAll('button').find(button => button.text().includes('Previous'))!
    const next = () => wrapper.get('nav[aria-label="Venue pages"]').findAll('button').find(button => button.text().includes('Next'))!
    try {
      expect(venueNames()).toEqual(['Hall 01', 'Hall 02', 'Hall 03', 'Hall 04', 'Hall 05', 'Hall 06'])
      expect(previous().attributes()).toHaveProperty('disabled')
      expect(wrapper.get('nav[aria-label="Venue pages"]').text()).toContain('Page 1 of 3')
      await next().trigger('click')
      expect(venueNames()).toEqual(['Hall 07', 'Hall 08', 'Hall 09', 'Hall 10', 'Hall 11', 'Hall 12'])
      await wrapper.findAll('aside button').find(button => button.text().startsWith('Hall 08'))!.trigger('click')
      expect(wrapper.get('[data-calendar-venue]').text()).toBe('room-8 / true')
      await next().trigger('click')
      expect(venueNames()).toEqual(['Hall 13'])
      expect(next().attributes()).toHaveProperty('disabled')
      await previous().trigger('click')
      expect(venueNames()[0]).toBe('Hall 07')
      await wrapper.get('input[type="search"]').setValue('Hall 0')
      expect(venueNames()).toEqual(['Hall 01', 'Hall 02', 'Hall 03', 'Hall 04', 'Hall 05', 'Hall 06'])
      expect(wrapper.get('nav[aria-label="Venue pages"]').text()).toContain('Page 1 of 2')
      await wrapper.get('input[type="search"]').setValue('')
      await next().trigger('click'); await next().trigger('click')
      await wrapper.setProps({ venues: venues.slice(0, 8) })
      expect(venueNames()).toEqual(['Hall 07', 'Hall 08'])
      expect(wrapper.get('nav[aria-label="Venue pages"]').text()).toContain('Page 2 of 2')
      expect(wrapper.get('[data-calendar-venue]').text()).toBe('room-8 / true')
      await wrapper.get('input[type="search"]').setValue('No matching hall')
      expect(venueNames()).toEqual([])
      expect(wrapper.text()).toContain('No venues match your search.')
      expect(wrapper.find('nav[aria-label="Venue pages"]').exists()).toBe(false)
      expect(wrapper.get('[data-calendar-venue]').text()).toBe('room-8 / true')
      await wrapper.get('input[type="search"]').setValue('')
      await wrapper.setProps({ venues: [] })
      expect(wrapper.text()).toContain('No venues available.')
      expect(wrapper.find('[data-calendar-venue]').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })
  it('TC-CS33-15 expands and collapses actual venue history, resets on venue change and omits controls for a short history', async () => {
    venueUi.history = Array.from({ length: 5 }, (_, index) => ({ id: `history-${index + 1}`, reason: `Recorded change ${index + 1}` }))
    const wrapper = await mountSuspended(VenueDetails, { props: { venue: { id: 'room-a' } } })
    const button = () => wrapper.get('button')
    try {
      expect(wrapper.findAll('ol li').map(row => row.findAll('p')[2]!.text())).toEqual(['Recorded change 1', 'Recorded change 2', 'Recorded change 3'])
      expect(button().text()).toBe('Show full history')
      await button().trigger('click')
      expect(wrapper.findAll('ol li')).toHaveLength(5)
      expect(wrapper.text()).toContain('Recorded change 5')
      expect(button().text()).toBe('Show recent history')
      expect(button().attributes('aria-expanded')).toBe('true')
      await button().trigger('click')
      expect(wrapper.findAll('ol li')).toHaveLength(3)
      expect(button().attributes('aria-expanded')).toBe('false')
      expect(button().attributes('aria-controls')).toBe(wrapper.get('ol').attributes('id'))
      await button().trigger('click')
      await wrapper.setProps({ venue: { id: 'room-b' } })
      expect(wrapper.findAll('ol li')).toHaveLength(3)
      expect(button().attributes('aria-expanded')).toBe('false')
      venueUi.historyResponses.at(-1)!.value = { items: [{ id: 'short', reason: 'Only change' }] }
      await flushPromises()
      expect(wrapper.find('button').exists()).toBe(false)
      venueUi.historyResponses.at(-1)!.value = { items: [] }
      await flushPromises()
      expect(wrapper.text()).toContain('No version history available.')
      expect(wrapper.find('button').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })
  it('TC-CS33-15 keeps expandable history controls disabled in server HTML until handlers attach', async () => {
    venueUi.history = Array.from({ length: 5 }, (_, index) => ({ id: `history-${index + 1}`, reason: `Recorded change ${index + 1}` }))
    const { createSSRApp } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const html = await renderToString(createSSRApp(VenueDetails, { venue: { id: 'room-a' } }))
    const container = document.createElement('div'); container.innerHTML = html
    expect(container.querySelectorAll('ol li')).toHaveLength(3)
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
  })
  it('TC-CS33-12 rejects an invalid time zone on create and replacement without changing the venue or history', async () => {
    const store = require('../../services/venue-service/src/store')
    const { start } = require('../helpers/service-integration.cjs')
    store.reset()
    const api = await start(require('../../services/venue-service/src/app'))
    const headers = { 'x-test-user-id': 'venue-staff-1', 'x-test-role': 'VENUE_STAFF' }
    try {
      const before = await api.http('/venues', { headers })
      const invalid = await api.http('/venues', { method: 'POST', headers, body: physicalVenue({ timeZone: 'Asia/Singapor' }) })
      expect(invalid.status).toBe(422)
      expect(invalid.body.error.fields.timeZone).toEqual(['Use a valid time zone, such as Asia/Singapore'])
      expect((await api.http('/venues', { headers })).body).toEqual(before.body)
      const created = await api.http('/venues', { method: 'POST', headers, body: physicalVenue({ timeZone: ' Asia/Singapore ' }) })
      expect(created.status).toBe(201)
      expect(created.body.timeZone).toBe('Asia/Singapore')
      const history = await api.http(`/venues/${created.body.id}/history`, { headers })
      const edited = await api.http(`/venues/${created.body.id}`, { method: 'PUT', headers, body: { ...created.body, timeZone: 'Asia/Singapor', reason: 'Invalid zone review' } })
      expect(edited.status).toBe(422)
      expect(edited.body.error.fields.timeZone).toEqual(invalid.body.error.fields.timeZone)
      expect((await api.http(`/venues/${created.body.id}`, { headers })).body).toEqual(created.body)
      expect((await api.http(`/venues/${created.body.id}/history`, { headers })).body).toEqual(history.body)
      for (const timeZone of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
        expect((await api.http('/venues', { method: 'POST', headers, body: physicalVenue({ timeZone }) })).status).toBe(201)
      }
    } finally { await api.close(); store.reset() }
  })
  it('TC-CS33-13 displays accessible time-zone field guidance without discarding the entered value', async () => {
    const message = 'Use a valid time zone, such as Asia/Singapore'
    const wrapper = mount(VenueForm, { props: { venue: physicalVenue({ timeZone: 'Asia/Singapor' }), errors: { timeZone: [message] } } })
    const field = wrapper.get('#venue-time-zone')
    expect(field.attributes('aria-invalid')).toBe('true')
    expect(field.attributes('aria-describedby')).toBe('venue-time-zone-error')
    expect(wrapper.get('#venue-time-zone-error').attributes('role')).toBe('alert')
    expect(wrapper.get('#venue-time-zone-error').text()).toBe(message)
    expect((field.element as HTMLInputElement).value).toBe('Asia/Singapor')
    await wrapper.setProps({ errors: null })
    expect(field.attributes('aria-invalid')).toBe('false')
    expect(field.attributes('aria-describedby')).toBeUndefined()
    wrapper.unmount()
  })
  it('TC-CS33-09 rejects closing at or before opening without accepting an overnight schedule', () => {
    for (const closesAt of ['17:00', '18:00']) {
      expect(validateVenue(physicalVenue({ operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '18:00', closesAt }] })))
        .toHaveProperty('operatingHours.0.time', ['Closing time must be after opening time'])
    }
    expect(validateVenue(physicalVenue({ operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '00:00', closesAt: '23:59' }] }))).toEqual({})
    expect(validateVenue(physicalVenue({ operatingHours: [{ weekday: 'MONDAY', isClosed: true, opensAt: '', closesAt: '' }] }))).toEqual({})
  })
  it('TC-CS33-01 creates a complete physical-venue payload with the existing Reason or note field', async () => {
    const form = createVenueForm({ ...physicalVenue(), capacity: 500 } as never)
    expect(venuePayload(form, 'venue-staff-1')).toMatchObject({ ...physicalVenue(), capacity: 500 })
    expect(operatingSchedule(form.operatingHours)).toEqual({ weekdays: ['MONDAY'], opensAt: '09:00', closesAt: '17:00' })
    expect(applyOperatingSchedule(form.operatingHours, ['MONDAY', 'WEDNESDAY'], '08:30', '18:00')).toEqual(expect.arrayContaining([
      { weekday: 'MONDAY', isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { weekday: 'TUESDAY', isClosed: true, opensAt: '', closesAt: '' },
      { weekday: 'WEDNESDAY', isClosed: false, opensAt: '08:30', closesAt: '18:00' },
    ]))
    const wrapper = mount(VenueForm, { props: { venue: physicalVenue() } })

    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(document.body.querySelector('[data-slot="popover-content"]')?.textContent).toContain('Reason or note')
  })
  it('TC-CS33-02 preserves a Venue Staff capacity replacement for another authorised viewer', () => {
    expect(venuePayload(createVenueForm({ ...physicalVenue(), capacity: 150 } as never), 'venue-staff-1').capacity).toBe(150)
  })
  it('TC-CS33-03 gives a Coordinator venue visibility but not venue-management authority', () => {
    expect(MOCK_ROLE_PERMISSIONS.EVENT_COORDINATOR).toContain('venues.view')
    expect(MOCK_ROLE_PERMISSIONS.EVENT_COORDINATOR).not.toContain('venues.manage')
  })
  it('TC-CS33-04 rejects a non-numeric capacity with field-level guidance', () => {
    expect(validateVenue(physicalVenue({ capacity: 'abc' }))).toMatchObject({ capacity: ['Capacity must be a positive integer'] })
  })
  it('TC-CS33-05 identifies a linked blocking booking before a venue deletion is allowed', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blockingCount: 1 }) }))
    await expect(blockingBookingCount('venue-with-block')).resolves.toBe(1)
    vi.stubGlobal('fetch', originalFetch)
    expect(apiErrorMessage({ data: { statusCode: 404, statusMessage: 'Venue not found' } })).toBe('Venue not found')
    expect(apiErrorMessage({ data: { data: { error: { fields: { venueId: ['Venue cannot be deleted while blocking bookings exist'] } } } } })).toBe('Venue cannot be deleted while blocking bookings exist')
  })
  it('TC-CS33-06 permits deletion eligibility when the booking link reports no blockers', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blockingCount: 0 }) }))
    await expect(blockingBookingCount('venue-without-block')).resolves.toBe(0)
    vi.stubGlobal('fetch', originalFetch)
  })
  it('TC-CS33-07 enforces the externalised capacity boundaries', () => {
    expect(validateVenue(physicalVenue({ capacity: 0 }))).toHaveProperty('capacity')
    expect(validateVenue(physicalVenue({ capacity: 1 }))).not.toHaveProperty('capacity')
    expect(validateVenue(physicalVenue({ capacity: 10_000 }))).not.toHaveProperty('capacity')
    expect(validateVenue(physicalVenue({ capacity: 10_001 }))).toHaveProperty('capacity')
  })
  it('TC-CS33-08 fails closed when the booking lookup is unavailable', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(blockingBookingCount('venue-lookup-failure')).rejects.toThrow('Booking service returned 503')
    vi.stubGlobal('fetch', originalFetch)
    expect(apiErrorMessage({ data: { statusCode: 503, statusMessage: 'The ConnectSphere service is unavailable. Please try again shortly.' } })).toBe('The ConnectSphere service is unavailable. Please try again shortly.')
    toastError.mockClear()
    useErrorAlert().showError({ data: { statusCode: 403, statusMessage: 'You do not have permission to do this' } }, 'Unable to save booking')
    expect(toastError).toHaveBeenCalledWith('You do not have permission to do this', { description: 'Unable to save booking' })
  })
})


describe('CS-33 — TC-CS33-11 venue form hydration safety', () => {
  it('SSR disables the native form and submit until handlers attach', async () => {
    const { createSSRApp } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const html = await renderToString(createSSRApp(VenueForm, { venue: physicalVenue() }))
    const container = document.createElement('div'); container.innerHTML = html
    const fields = [...container.querySelectorAll('form input, form select, form button')] as (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[]
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every(field => field.disabled || field.closest('fieldset[disabled]') !== null)).toBe(true)
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
  })
})
