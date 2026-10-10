import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const fixture = vi.hoisted(() => ({
  fetch: vi.fn(),
  data: { value: null as unknown },
  error: { value: null as unknown },
  queue: { value: { requests: [] as Array<Record<string, unknown>> } },
  user: { value: { id: 'coordinator-1', role: 'EVENT_COORDINATOR' } as { id: string, role: string } | null },
  routeId: 'event-40',
}))

mockNuxtImport('useFetch', () => (url: string) => {
  if (url === '/api/technical-equipment-types')
    return { data: ref({ equipmentTypes: [{ id: 'projector', name: 'projector' }, { id: 'microphone', name: 'microphone' }] }), error: ref(null) }
  if (url === '/api/technical-requests')
    return { data: fixture.queue, error: ref(null), refresh: vi.fn() }
  return { data: fixture.data, error: fixture.error }
})
mockNuxtImport('useRequestFetch', () => () => fixture.fetch)
mockNuxtImport('useRoute', () => () => ({ params: { id: fixture.routeId } }))
mockNuxtImport('useUserSession', () => () => ({ user: fixture.user }))

describe('CS-40 — Technical requirements frontend', () => {
  it('renders an editable equipment request and sends the complete requirements when submitted', async () => {
    fixture.data = ref(null)
    fixture.error = ref({ statusCode: 404, statusMessage: 'Technical request not found.' })
    fixture.user.value = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }
    fixture.fetch.mockReset().mockResolvedValue({ eventRequestId: 'event-40', version: 1, status: 'SUBMITTED' })
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await wrapper.get('input[type="number"]').setValue('2')
      expect(wrapper.get('[data-testid="selected-equipment"]').text()).toContain('projector — 2')
      await wrapper.get('textarea[aria-label="Placement and preparation details"]').setValue('Projector at the front of the hall')
      await wrapper.get('input[type="checkbox"][aria-label="Technical support is required"]').setValue(true)
      await wrapper.get('textarea[aria-label="Support details"]').setValue('Please assist with setup')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(fixture.fetch).toHaveBeenCalledWith('/api/events/event-40/technical-request', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          equipment: [{ equipmentType: 'projector', quantity: 2 }],
          supportRequired: true,
          supportDetails: 'Please assist with setup',
          placementDetails: 'Projector at the front of the hall',
        }),
      }))
      expect(wrapper.text()).toContain('Submitted for Technical Support review')
    }
    finally { wrapper.unmount() }
  })

  it('blocks incomplete requirements and shows validation feedback without calling the API', async () => {
    fixture.data = ref(null)
    fixture.error = ref(null)
    fixture.user.value = { id: 'coordinator-1', role: 'EVENT_COORDINATOR' }
    fixture.fetch.mockReset()
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await wrapper.get('textarea[aria-label="Placement and preparation details"]').setValue('Front of hall')
      await wrapper.get('form').trigger('submit')
      expect(fixture.fetch).not.toHaveBeenCalled()
      expect(wrapper.get('[role="alert"]').text()).toContain('Specify equipment or support, or mark requirements as not required')
    }
    finally { wrapper.unmount() }
  })

  it('shows a submitted request read-only to Safety Officers and displays its decision status', async () => {
    fixture.data = ref({ eventRequestId: 'event-40', version: 2, status: 'APPROVED', equipment: [{ equipmentType: 'projector', quantity: 2 }], supportRequired: false, supportDetails: '', placementDetails: 'Front of hall', notRequired: false, decisionReason: null })
    fixture.error = ref(null)
    fixture.user.value = { id: 'safety-1', role: 'SAFETY_OFFICER' }
    fixture.fetch.mockReset()
    const module = await import('../../frontend/app/pages/technical-requirements/[id].vue').catch(() => null)
    expect(module, 'CS-40 technical requirements page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      expect(wrapper.text()).toContain('Approved')
      expect(wrapper.get('textarea[aria-label="Placement and preparation details"]').element.value).toBe('Front of hall')
      expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    }
    finally { wrapper.unmount() }
  })

  it('requires a rejection reason and posts a versioned decision from the Technical Support queue', async () => {
    fixture.queue = ref({ requests: [{ eventRequestId: 'event-40', coordinatorId: 'coordinator-1', version: 3, status: 'SUBMITTED', equipment: [{ equipmentType: 'projector', quantity: 2 }], supportRequired: true, supportDetails: 'Assist with setup', placementDetails: 'Front of hall', notRequired: false }] })
    fixture.user.value = { id: 'support-1', role: 'TECHNICAL_SUPPORT_STAFF' }
    fixture.fetch.mockReset().mockResolvedValue({ status: 'REJECTED' })
    const module = await import('../../frontend/app/pages/technical-requests.vue').catch(() => null)
    expect(module, 'CS-40 Technical Support review page should be implemented').not.toBeNull()
    const wrapper = await mountSuspended(module!.default)
    try {
      await wrapper.findAll('button').at(-1)!.trigger('click')
      expect(wrapper.get('[role="alert"]').text()).toContain('A reason is required')
      expect(fixture.fetch).not.toHaveBeenCalled()
      await wrapper.get('textarea[aria-label="Decision note"]').setValue('No technician is available')
      await wrapper.findAll('button').at(-1)!.trigger('click')
      await flushPromises()
      expect(fixture.fetch).toHaveBeenCalledWith('/api/events/event-40/technical-request/decision', expect.objectContaining({
        method: 'POST', body: { decision: 'REJECTED', reason: 'No technician is available', version: 3 },
      }))
    }
    finally { wrapper.unmount() }
  })
})
