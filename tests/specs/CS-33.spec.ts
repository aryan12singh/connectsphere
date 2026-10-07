import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
const toastError = vi.hoisted(() => vi.fn())
vi.mock('vue-sonner', () => ({ toast: { error: toastError } }))
import { MOCK_ROLE_PERMISSIONS } from '../../frontend/server/utils/mockPermissions'
import VenueForm from '../../frontend/app/components/venue/VenueForm.vue'
import { apiErrorMessage } from '../../frontend/app/components/shared/api-error'
import { applyOperatingSchedule, createVenueForm, operatingSchedule, venuePayload } from '../../frontend/app/components/venue/venue-form-state'
import { useErrorAlert } from '../../frontend/app/composables/useErrorAlert'

process.env.DATA_MODE = 'memory'
process.env.NODE_ENV = 'test'
const require = createRequire(import.meta.url)
const { validateVenue } = require('../../services/venue-service/src/validation') as { validateVenue: (body: Record<string, unknown>) => Record<string, string[]> }
const { blockingBookingCount } = require('../../services/venue-service/src/bookingClient') as { blockingBookingCount: (venueId: string) => Promise<number> }

function physicalVenue(overrides: Record<string, unknown> = {}) {
  return { name: 'Marina Convention Centre', address: '1 Bayfront Avenue, Singapore', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: ['PROJECTOR'], accessibilityTags: ['WHEELCHAIR_ACCESS'], timeZone: 'Asia/Singapore', managedById: 'venue-staff-1', reason: 'Venue review', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '17:00' }], ...overrides }
}

describe('CS-33 — venue records', () => {
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
