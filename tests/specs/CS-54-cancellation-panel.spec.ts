import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import CancellationPanel from '../../frontend/app/components/events/CancellationPanel.vue'

// CS-54 panel states: an Organiser with a waiting cancellation request sees
// that request instead of a second form, and a finished cancellation does not
// keep the "Cancel this Event" heading.
const ui = vi.hoisted(() => ({ fetch: vi.fn() }))
mockNuxtImport('useRequestFetch', () => () => ui.fetch)

const lookups = () => ui.fetch.mock.calls.filter(([url]) => String(url).endsWith('/change-requests'))
const mount = (props: Record<string, unknown>) => mountSuspended(CancellationPanel, {
  props: { requestId: 'request-54', eventStatus: 'CONFIRMED', isCoordinator: false, isOrganiser: true, ...props },
})

describe('CS-54 — cancellation panel states', () => {
  it('shows a waiting Organiser request instead of the request form', async () => {
    ui.fetch.mockReset().mockResolvedValue({ items: [{ scope: 'CANCELLATION', status: 'PENDING' }] })
    const wrapper = await mount({})
    await flushPromises()
    expect(ui.fetch).toHaveBeenCalledWith('/api/events/request-54/change-requests')
    expect(wrapper.text()).toContain('A cancellation request is waiting for the Coordinator.')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('offers the form when no cancellation request is waiting or the lookup fails', async () => {
    ui.fetch.mockReset().mockResolvedValue({ items: [{ scope: 'EVENT', status: 'PENDING' }, { scope: 'CANCELLATION', status: 'REJECTED' }] })
    expect((await mount({})).find('textarea').exists()).toBe(true)
    ui.fetch.mockReset().mockRejectedValue(new Error('offline'))
    const failed = await mount({})
    await flushPromises()
    expect(failed.find('textarea').exists()).toBe(true)
  })

  it('switches to the waiting state after the Organiser sends a request', async () => {
    ui.fetch.mockReset().mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ id: 'change' })
    const wrapper = await mount({})
    await flushPromises()
    await wrapper.get('textarea').setValue('Speaker withdrew')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ui.fetch).toHaveBeenLastCalledWith('/api/events/request-54/change-requests', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.text()).toContain('A cancellation request is waiting for the Coordinator.')
  })

  it('does not look up requests for the Coordinator', async () => {
    ui.fetch.mockReset()
    const wrapper = await mount({ isCoordinator: true })
    expect(lookups()).toEqual([])
    expect(wrapper.get('h2').text()).toBe('Cancel this Event')
  })

  it('uses a neutral heading once the Event is cancelling or cancelled', async () => {
    ui.fetch.mockReset()
    for (const eventStatus of ['CANCELLING', 'CANCELLED']) {
      for (const isCoordinator of [true, false]) {
        const wrapper = await mount({ eventStatus, isCoordinator })
        expect(wrapper.get('h2').text()).toBe('Cancellation')
      }
    }
    expect(lookups()).toEqual([])
  })
})
