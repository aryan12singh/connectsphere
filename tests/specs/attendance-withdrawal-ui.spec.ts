import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import RegistrationsPage from '../../frontend/app/pages/attendances/registrations/index.vue'

const fixture = vi.hoisted(() => ({ rows: [] as any[], refresh: vi.fn(), send: vi.fn() }))
mockNuxtImport('useFetch', () => async () => {
  const { ref } = await import('vue')
  return { data: ref({ registrations: fixture.rows }), error: ref(null), refresh: fixture.refresh }
})
registerEndpoint('/api/attendances/registrations/registration-1/withdraw', { method: 'POST', handler: () => fixture.send() })

const row = (enabled: boolean) => ({
  id: 'registration-1', eventId: 'event-1', status: 'CONFIRMED', registeredAt: '2026-01-01T00:00:00Z',
  event: { eventId: 'event-1', title: 'Example event', startAt: '2030-01-01T00:00:00Z', endAt: '2030-01-01T01:00:00Z', timeZone: 'Asia/Singapore', primaryVenueName: 'Hall', withdrawalEnabled: enabled, withdrawalCutoffAt: '2030-01-01T00:00:00Z' },
})

describe('withdrawal controls', () => {
  beforeEach(() => { fixture.refresh.mockReset(); fixture.send.mockReset(); window.confirm = vi.fn(() => true) })

  it('shows why withdrawal is disabled before the attendee clicks', async () => {
    fixture.rows = [row(false)]
    const wrapper = await mountSuspended(RegistrationsPage)
    const button = wrapper.get('button[aria-label="Withdraw registration for Example event"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('The organiser has not enabled registration withdrawal.')
    expect(fixture.send).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('updates the card as soon as the withdrawal succeeds', async () => {
    fixture.rows = [row(true)]
    fixture.send.mockResolvedValue({ registration: { id: 'registration-1', status: 'WITHDRAWN', withdrawnAt: '2026-10-29T00:00:00Z' } })
    const wrapper = await mountSuspended(RegistrationsPage)
    await wrapper.get('button[aria-label="Withdraw registration for Example event"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Withdrawn'))
    expect(wrapper.find('button[aria-label="Withdraw registration for Example event"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
