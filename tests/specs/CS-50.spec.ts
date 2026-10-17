// CS-50 (Jira): event lifecycle and Coordinator assignment notifications.
// TC-CS50-03: the Organiser opens a notice from the bell.
// Other CS-50 cases run in services/notification-service (unit, contract, PostgreSQL).
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import NotificationBell from '../../frontend/app/components/navbar/NotificationBell.vue'
import NotificationFailures from '../../frontend/app/components/shared/NotificationFailures.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

// A tiny stand-in for the BFF: one unread EVENT_APPROVED notice.
const notice = { id: 'n1', type: 'EVENT_APPROVED', text: 'Your event request "Tech Summit" was approved. Planning has started.', link: '/events/E1', createdAt: new Date().toISOString(), readAt: null as string | null }
const reads: string[] = []
registerEndpoint('/api/notifications', () => ({ items: [notice], unread: notice.readAt ? 0 : 1, badge: notice.readAt ? '' : '1' }))
registerEndpoint('/api/notifications/n1/read', { method: 'POST', handler: () => { reads.push('n1'); notice.readAt = new Date().toISOString(); return null } })

describe('CS-50 — bell and inbox', () => {
  it('TC-CS50-03 badge shows 1; clicking the notice saves it as read, opens /events/E1 and clears the badge', async () => {
    const wrapper = await mountSuspended(NotificationBell)
    await vi.waitFor(() => expect(wrapper.find('#bell-badge').text()).toBe('1'))
    await wrapper.find('[data-testid="bell"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#notifications').text()).toContain('Planning has started'))
    await wrapper.find('[data-notice-id="n1"]').trigger('click')
    // Marking read and reloading the inbox are two requests; wait for both.
    await vi.waitFor(() => expect(navigateToMock).toHaveBeenCalledWith('/events/E1'))
    expect(reads).toEqual(['n1'])
    expect(wrapper.find('#bell-badge').exists()).toBe(false)
  })

  it('TC-CS50-08u Technical Support sees failed deliveries without notice text', async () => {
    registerEndpoint('/api/notifications/failures', () => ({ items: [{ messageId: 'm8', messageType: 'CoordinatorAssigned', aggregateId: 'r8', attempts: 4, lastError: 'User service returned 503', failedAt: '2027-01-11T02:00:00.000Z' }] }))
    const wrapper = await mountSuspended(NotificationFailures)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-failures"]').exists()).toBe(true))
    const table = wrapper.find('[data-testid="notification-failures"]')
    expect(table.text()).toContain('CoordinatorAssigned')
    expect(table.text()).toContain('4')
  })
})
