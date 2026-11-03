import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const ui = vi.hoisted(() => ({
  permissions: [] as string[],
  failures: [] as any[],
}))

mockNuxtImport('useUserSession', () => () => ({ user: ref({ id: 'support', role: 'TECHNICAL_SUPPORT_STAFF', roles: ['TECHNICAL_SUPPORT_STAFF'], permissions: ui.permissions }) }))
mockNuxtImport('useFetch', () => (url: string) => ({
  data: url.includes('notifications/failures') ? ref({ items: ui.failures }) : url.includes('technical-requests') ? ref({ requests: [] }) : ref({ items: [] }),
  error: ref(null),
  refresh: vi.fn(),
}))
mockNuxtImport('useRequestFetch', () => () => vi.fn())

async function supportHome(permissions: string[]) {
  ui.permissions = permissions
  ui.failures = [{ messageId: 'm8', messageType: 'CoordinatorAssigned', aggregateId: 'r8', attempts: 4, lastError: 'User service returned 503', failedAt: '2027-01-11T02:00:00.000Z' }]
  const page = await import('../../frontend/app/pages/technical-requirements/index.vue')
  const wrapper = await mountSuspended(page.default)
  await flushPromises()
  return wrapper
}

describe('CS-50 — failed deliveries on the Technical Support home', () => {
  it('TC-CS50-08 Technical Support with notifications.failures.view opens failed deliveries from its home page', async () => {
    const wrapper = await supportHome(['technical.review', 'notifications.failures.view'])
    const tab = wrapper.findAll('[role="tab"]').find(item => item.text() === 'Failed notifications')
    expect(tab).toBeDefined()
    await tab!.trigger('mousedown', { button: 0 })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="notification-failures"]').exists()).toBe(true))
    const table = wrapper.get('[data-testid="notification-failures"]')
    expect(table.text()).toContain('CoordinatorAssigned')
    expect(table.text()).toContain('User service returned 503')
  })

  it('TC-CS50-08 the tab is hidden without notifications.failures.view', async () => {
    const wrapper = await supportHome(['technical.review'])
    expect(wrapper.findAll('[role="tab"]').some(item => item.text() === 'Failed notifications')).toBe(false)
  })
})
