import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const ui = vi.hoisted(() => ({ queue: { value: { requests: [] as any[] } }, error: { value: undefined as unknown }, command: vi.fn(), refresh: vi.fn() }))
mockNuxtImport('useFetch', () => (url: string) => ({
  data: url.includes('technical-requests') ? ui.queue : ref({ items: [] }),
  error: url.includes('technical-requests') ? ui.error : ref(null), refresh: ui.refresh,
}))
mockNuxtImport('useRequestFetch', () => () => ui.command)
registerEndpoint('/api/equipment/requests/reserve-ui/availability', () => ({
  requestVersion: 1, checkedAt: '2035-01-01T09:00:00Z', fulfillable: true,
  period: { startAt: '2035-01-01T10:00:00Z', endAt: '2035-01-01T12:00:00Z' },
  lines: [{ equipmentType: 'projector', requested: 2, available: 5, shortfall: 0 }],
}))

async function review() {
  ui.queue = ref({ requests: [{
    eventRequestId: 'reserve-ui', coordinatorId: 'coordinator', version: 1, status: 'APPROVED', reserved: false,
    equipment: [{ equipmentType: 'projector', quantity: 2, venueId: 'hall', venueName: 'Main hall' }],
    supportRequired: false, supportDetails: '', placementDetails: 'At the lectern', notRequired: false,
    equipmentPeriod: null, event: null,
  }] })
  ui.error = ref(undefined)
  ui.command.mockReset().mockResolvedValue({ requestVersion: 1, reservations: [{ id: 'reservation', equipmentType: 'projector', quantity: 2 }] })
  ui.refresh.mockReset().mockResolvedValue(undefined)
  const page = await import('../../frontend/app/pages/technical-requirements/index.vue')
  const wrapper = await mountSuspended(page.default)
  await flushPromises()
  return wrapper
}

const require = createRequire(import.meta.url)
const { availabilityLine } = require('../../services/equipment-service/src/domain/equipment-availability') as {
  availabilityLine: (total: number, requested: number, commitments: Array<Record<string, unknown>>, startAt: string, endAt: string) => { requested: number, available: number, shortfall: number }
}

describe('CS-42 — reservation period boundaries', () => {
  it('TC-CS42-05 permits a new reservation to start when the existing reservation ends', () => {
    const result = availabilityLine(5, 3, [
      { quantity: 2, startAt: '2026-11-12T11:00:00.000Z', endAt: '2026-11-12T12:45:00.000Z' },
    ], '2026-11-12T12:45:00.000Z', '2026-11-12T14:00:00.000Z')

    expect(result).toEqual({ requested: 3, available: 5, shortfall: 0 })
  })
})

describe('CS-42 — confirmed reservation UI', () => {
  it('TC-CS42-01 pairs the availability values with their equipment and venue headings', async () => {
    const wrapper = await review()
    try {
      const table = wrapper.get('table[aria-label="Equipment availability"]')
      expect(table.findAll('thead th').map(cell => cell.text())).toEqual(['Equipment', 'Requested', 'Available', 'Shortfall', 'Result', 'Venue'])
      expect(table.findAll('tbody td').map(cell => cell.text())).toEqual(['2', '5', '0', 'Available', 'Main hall'])
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS42-01 shows a confirmed reservation while the queue metadata refresh is still pending', async () => {
    const wrapper = await review()
    let completeRefresh!: () => void
    ui.refresh.mockReturnValue(new Promise<void>(resolve => { completeRefresh = resolve }))
    try {
      await wrapper.findAll('button').find(button => button.text() === 'Reserve complete request')!.trigger('click')
      await flushPromises()
      expect(ui.command).toHaveBeenCalledWith('/api/equipment/requests/reserve-ui/reserve', expect.objectContaining({ method: 'POST', body: { version: 1 } }))
      const reserved = wrapper.findAll('button').find(button => button.text() === 'Reserved')
      expect(reserved, 'The successful reservation must be visible before unrelated queue metadata finishes loading').toBeDefined()
      expect(reserved!.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Complete current equipment reservation saved.')
    }
    finally { completeRefresh(); await flushPromises(); wrapper.unmount() }
  })

  it('TC-CS42-02 leaves the reserve action available and never reports success after a rejected command', async () => {
    const wrapper = await review()
    ui.command.mockRejectedValue(new Error('Equipment is unavailable'))
    try {
      await wrapper.findAll('button').find(button => button.text() === 'Reserve complete request')!.trigger('click')
      await flushPromises()
      expect(wrapper.findAll('button').some(button => button.text() === 'Reserved')).toBe(false)
      expect(wrapper.text()).not.toContain('Complete current equipment reservation saved.')
      expect(wrapper.text()).toContain('Equipment is unavailable')
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS42-01 retains the confirmed reservation when refreshing queue metadata fails', async () => {
    const wrapper = await review()
    // Nuxt refresh resolves after storing its error and clearing the data.
    ui.refresh.mockImplementation(async () => {
      ui.queue.value = { requests: [] }
      ui.error.value = new Error('Metadata unavailable')
    })
    try {
      await wrapper.findAll('button').find(button => button.text() === 'Reserve complete request')!.trigger('click')
      await flushPromises()
      expect(wrapper.findAll('button').some(button => button.text() === 'Reserved')).toBe(true)
      expect(wrapper.text()).toContain('Complete current equipment reservation saved.')
      expect(wrapper.text()).not.toContain('Unable to reserve all requested equipment.')
      expect(wrapper.text()).toContain('Equipment reservation saved. Reload to refresh the request list.')
    }
    finally { wrapper.unmount() }
  })

  it('TC-CS42-03 keeps a newer request version returned by the refresh authoritative', async () => {
    const wrapper = await review()
    ui.refresh.mockImplementation(async () => {
      ui.queue.value = { requests: ui.queue.value.requests.map(request => ({ ...request, version: 2, reserved: false })) }
    })
    try {
      await wrapper.findAll('button').find(button => button.text() === 'Reserve complete request')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('v2')
      expect(wrapper.findAll('button').some(button => button.text() === 'Reserved')).toBe(false)
      expect(wrapper.text()).not.toContain('Complete current equipment reservation saved.')
    }
    finally { wrapper.unmount() }
  })
})
