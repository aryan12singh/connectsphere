import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createRequire } from 'node:module'
import { Select } from '../../frontend/app/components/ui/select'

const require = createRequire(import.meta.url)
const { validateRequirements } = require('../../services/equipment-service/src/domain/technical-request') as {
  validateRequirements: (input: unknown, equipmentTypes: unknown[], previous?: unknown) => { valid: boolean, errors?: Record<string, string[]>, value?: Record<string, any> }
}

const fixture = vi.hoisted(() => ({
  fetch: vi.fn(),
  data: { value: null as unknown },
  error: { value: null as unknown },
  queue: { value: { requests: [] as Array<Record<string, unknown>> } },
  user: { value: { id: 'coordinator-1', role: 'EVENT_COORDINATOR' } as { id: string, role: string } | null },
  routeId: 'event-40',
}))

mockNuxtImport('useFetch', () => (url: string) => {
  if (url === '/api/venues')
    return { data: ref({ items: [{ id: 'venue-40', name: 'Main hall' }] }), error: ref(null) }
  if (url === '/api/technical-equipment-types')
    return { data: ref({ equipmentTypes: [{ id: 'projector', name: 'projector', total: 2, version: 1 }, { id: 'microphone', name: 'microphone', total: 4, version: 1 }] }), error: ref(null) }
  if (url === '/api/technical-requests' || url === '/api/technical-requests?includeResolved=1')
    return { data: fixture.queue, error: ref(null), refresh: vi.fn() }
  if (url === '/api/equipment/inventory')
    return { data: ref({ items: [] }), error: ref(null), refresh: vi.fn() }
  return { data: fixture.data, error: fixture.error }
})
mockNuxtImport('useRequestFetch', () => () => fixture.fetch)
mockNuxtImport('useRoute', () => () => ({ params: { id: fixture.routeId }, query: {} }))
mockNuxtImport('useUserSession', () => () => ({ user: fixture.user }))

async function chooseEquipment(wrapper: VueWrapper, equipmentType: string) {
  const selects = wrapper.findAllComponents(Select)
  await selects[0]!.setValue(equipmentType)
  await selects[1]!.setValue('venue-40')
}

describe('CS-40 — Technical requirements frontend', () => {
  it('TC-CS40-01 renders an editable request and submits the complete Coordinator requirements', async () => {
    fixture.data = ref(null)
    fixture.error = ref({ statusCode: 404, statusMessage: 'Technical request not found.' })
    fixture.user.value = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }
    fixture.fetch.mockReset().mockResolvedValue({ eventRequestId: 'event-40', version: 1, status: 'SUBMITTED' })
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await chooseEquipment(wrapper, 'projector')
      await wrapper.get('input[type="number"]').setValue('2')
      expect(wrapper.get('[data-testid="selected-equipment"]').text()).toContain('projector — 2')
      await wrapper.get('textarea#placement-details').setValue('Projector at the front of the hall')
      await wrapper.findAll('[role="checkbox"]')[1]!.trigger('click')
      await wrapper.get('textarea#support-details').setValue('Please assist with setup')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(fixture.fetch).toHaveBeenCalledWith('/api/events/event-40/technical-request', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'venue-40' }],
          supportRequired: true,
          supportDetails: 'Please assist with setup',
          placementDetails: 'Projector at the front of the hall',
        }),
      }))
      expect(wrapper.text()).toContain('Submitted for Technical Support review')
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS40-02 blocks empty requirements without calling the API', async () => {
    fixture.data = ref(null)
    fixture.error = ref(null)
    fixture.user.value = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }
    fixture.fetch.mockReset()
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await wrapper.get('textarea#placement-details').setValue('Front of hall')
      await wrapper.get('form').trigger('submit')
      expect(fixture.fetch).not.toHaveBeenCalled()
      expect(wrapper.get('[role="alert"]').text()).toContain('Specify equipment or support, or mark requirements as not required')
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS40-09 shows an assigned Safety Officer the submitted request read-only', async () => {
    fixture.data = ref({ eventRequestId: 'event-40', version: 2, status: 'APPROVED', equipment: [{ equipmentType: 'projector', quantity: 2 }], supportRequired: false, supportDetails: '', placementDetails: 'Front of hall', notRequired: false, decisionReason: null })
    fixture.error = ref(null)
    fixture.user.value = { id: 'safety-1', role: 'SAFETY_OFFICER' }
    fixture.fetch.mockReset()
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      expect(wrapper.text()).toContain('Approved')
      expect((wrapper.get('textarea#placement-details').element as HTMLTextAreaElement).value).toBe('Front of hall')
      expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
      await wrapper.get('form').trigger('submit')
      expect(fixture.fetch).not.toHaveBeenCalled()
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS40-04 blocks a blank rejection reason and posts the versioned Support decision', async () => {
    fixture.queue = ref({ requests: [{ eventRequestId: 'event-40', coordinatorId: 'coordinator-1', version: 3, status: 'SUBMITTED', equipment: [{ equipmentType: 'projector', quantity: 2 }], supportRequired: true, supportDetails: 'Assist with setup', placementDetails: 'Front of hall', notRequired: false }] })
    fixture.user.value = { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }
    fixture.fetch.mockReset().mockResolvedValue({ status: 'REJECTED' })
    const module = await import('../../frontend/app/pages/technical-requirements/index.vue').catch(() => null)
    expect(module, 'CS-40 Technical Support review page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await wrapper.get('button[value="REJECTED"]').trigger('click')
      await wrapper.findAll('button').find(button => button.text().includes('Submit decision'))!.trigger('click')
      expect(wrapper.get('[role="alert"]').text()).toContain('A reason is required')
      expect(fixture.fetch).not.toHaveBeenCalled()
      await wrapper.get('textarea[aria-label="Decision note"]').setValue('No technician is available')
      await wrapper.findAll('button').find(button => button.text().includes('Submit decision'))!.trigger('click')
      await flushPromises()
      expect(fixture.fetch).toHaveBeenCalledWith('/api/events/event-40/technical-request/decision', expect.objectContaining({
        method: 'POST', body: { decision: 'REJECTED', reason: 'No technician is available', version: 3 },
      }))
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS40-06 recognizes a direct NOT_REQUIRED declaration in the form with stock and text limits', async () => {
    fixture.data = ref(null)
    fixture.error = ref({ statusCode: 404, statusMessage: 'Technical request not found.' })
    fixture.user.value = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }
    fixture.fetch.mockReset().mockResolvedValue({
      eventRequestId: 'event-40', version: 1, status: 'NOT_REQUIRED', equipment: [], supportRequired: false,
      supportDetails: '', placementDetails: 'No setup needed', notRequired: true, decidedById: 'coordinator-1', decidedAt: '2026-10-17T10:00:00.000Z',
    })
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    const wrapper = await mountSuspended(module!.default)
    try {
      await chooseEquipment(wrapper, 'projector')
      expect(wrapper.get('input[aria-label="projector quantity"]').attributes('max')).toBe('2')
      await wrapper.findAll('[role="checkbox"]')[1]!.trigger('click')
      expect(wrapper.get('textarea#support-details').attributes('maxlength')).toBe('1000')
      await wrapper.findAll('[role="checkbox"]')[1]!.trigger('click')
      expect(wrapper.get('textarea#placement-details').attributes('maxlength')).toBe('500')
      await wrapper.get('textarea#placement-details').setValue('No setup needed')
      await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(fixture.fetch).toHaveBeenCalledWith('/api/events/event-40/technical-request', expect.objectContaining({
        method: 'POST', body: expect.objectContaining({ notRequired: true, equipment: [], supportRequired: false }),
      }))
      expect(wrapper.get('[data-testid="technical-status"]').text()).toContain('No technical requirements')
      expect(wrapper.text()).toContain('No Technical Support review or equipment reservation is required')
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS40-14 rejects a requested quantity above physical stock without saving a partial request', () => {
    const result = validateRequirements({
      eventId: 'event-40', coordinatorId: 'coordinator-40',
      equipment: [{ equipmentType: 'projector', quantity: 2 }],
      supportRequired: false, supportDetails: '', placementDetails: 'Projector in the main hall', notRequired: false,
    }, [{ name: 'projector', total: 1 }])
    expect(result.valid).toBe(false)
    expect(result.errors?.['equipment.0.quantity']).toBeDefined()
  })

  it('TC-CS40-15 applies prototype text limits and excludes support from not-required declarations', () => {
    const base = {
      eventId: 'event-40', coordinatorId: 'coordinator-40',
      equipment: [{ equipmentType: 'projector', quantity: 2 }],
      supportRequired: false, supportDetails: '', placementDetails: 'Projector in the main hall', notRequired: false,
    }
    const tooMuchSupport = validateRequirements({ ...base, supportRequired: true, supportDetails: 'x'.repeat(1001) }, [{ name: 'projector', total: 2 }])
    const tooMuchPlacement = validateRequirements({ ...base, placementDetails: 'x'.repeat(501) }, [{ name: 'projector', total: 2 }])
    const contradictory = validateRequirements({ ...base, equipment: [], supportRequired: true, supportDetails: 'Technician needed', notRequired: true }, [{ name: 'projector', total: 2 }])

    expect(tooMuchSupport.errors?.supportDetails).toBeDefined()
    expect(tooMuchPlacement.errors?.placementDetails).toBeDefined()
    expect(contradictory.errors?.notRequired).toBeDefined()
  })

  it('TC-CS40-06 treats an explicit empty declaration as current NOT_REQUIRED proof', () => {
    const result = validateRequirements({
      eventId: 'event-40', coordinatorId: 'coordinator-40', equipment: [],
      supportRequired: false, supportDetails: '', placementDetails: 'No setup required', notRequired: true,
    }, [{ name: 'projector', total: 2 }])
    expect(result.valid).toBe(true)
    expect(result.value?.status).toBe('NOT_REQUIRED')
  })
})
