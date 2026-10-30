import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const ui = vi.hoisted(() => ({
  queue: { value: { requests: [] as any[] } },
  inventory: { value: { items: [] as any[] } },
  command: vi.fn(),
  refresh: vi.fn(),
}))

mockNuxtImport('useFetch', () => (url: string) => ({
  data: url.includes('technical-requests') ? ui.queue : ui.inventory,
  error: ref(null),
  refresh: ui.refresh,
}))
mockNuxtImport('useRequestFetch', () => () => ui.command)
registerEndpoint('/api/equipment/requests/stock-fixture/availability', () => ({
  requestVersion: 1,
  checkedAt: '2035-01-01T09:00:00.000Z',
  fulfillable: true,
  period: { startAt: '2035-01-01T10:00:00.000Z', endAt: '2035-01-01T12:00:00.000Z' },
  lines: [{ equipmentType: 'projector', requested: 1, available: 5, shortfall: 0 }],
}))
registerEndpoint('/api/_auth/session', () => ({ user: { id: 'support', role: 'TECHNICAL_SUPPORT_STAFF' } }))

async function supportInventoryPage() {
  ui.queue.value = { requests: [{
    eventRequestId: 'stock-fixture', coordinatorId: 'coordinator', version: 1, status: 'PENDING_TECH_REVIEW', reserved: false,
    equipment: [{ equipmentType: 'projector', quantity: 1, venueId: 'hall', venueName: 'Main hall' }],
    supportRequired: false, supportDetails: '', placementDetails: 'At the lectern', notRequired: false,
    equipmentPeriod: { startAt: '2035-01-01T10:00:00.000Z', endAt: '2035-01-01T12:00:00.000Z' },
    event: { title: 'Stock control fixture', startAt: '2035-01-01T10:00:00.000Z', endAt: '2035-01-01T12:00:00.000Z', timeZone: 'Asia/Singapore', submitter: { name: 'Coordinator' } },
  }] }
  ui.inventory.value = { items: [{ equipmentType: 'projector', total: 5, version: 1 }] }
  ui.command.mockReset().mockResolvedValue({ id: 'operation-1' })
  ui.refresh.mockReset().mockResolvedValue(undefined)
  const page = await import('../../frontend/app/pages/technical-requirements/index.vue')
  const wrapper = await mountSuspended(page.default)
  await flushPromises()
  ui.command.mockClear()
  return wrapper
}

describe('CS-41 — Support stock UI supplement', () => {
  it('TC-CS41-14 records a bounded stock-unavailability operation through the Support UI', async () => {
    const wrapper = await supportInventoryPage()
    try {
      const stockTab = wrapper.findAll('[role="tab"]').find(tab => tab.text() === 'Manage equipment stock')
      expect(stockTab).toBeDefined()
      await stockTab!.trigger('mousedown', { button: 0 })
      await flushPromises()

      await wrapper.get('#operation-start').setValue('2035-01-02T09:30')
      await wrapper.get('#operation-end').setValue('2035-01-02T10:30')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(ui.command).toHaveBeenCalledWith('/api/equipment/operations', expect.objectContaining({
        method: 'POST',
        body: {
          equipmentType: 'projector',
          quantity: 1,
          reason: 'Repair',
          startAt: '2035-01-02T01:30:00.000Z',
          endAt: '2035-01-02T02:30:00.000Z',
        },
      }))
      expect(wrapper.text()).toContain('Operational unavailability recorded.')
    }
    finally { wrapper.unmount() }
  })
})
