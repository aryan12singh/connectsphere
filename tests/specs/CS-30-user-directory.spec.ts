import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Technical Support user directory (UAT guide gap "no /support page") and the
// Session 3 deactivation rule (DEF-53-08): the page shows auth-service's refusal
// when a Coordinator still has open Events.
const ui = vi.hoisted(() => ({
  permissions: [] as string[],
  users: [] as any[],
  setUserActive: vi.fn(),
  listUsers: vi.fn(),
}))

mockNuxtImport('useUserSession', () => () => ({ user: ref({ id: 'support', role: 'TECHNICAL_SUPPORT_STAFF', roles: ['TECHNICAL_SUPPORT_STAFF'], permissions: ui.permissions }) }))
mockNuxtImport('useAdminApi', () => () => ({ listUsers: ui.listUsers, setUserActive: ui.setUserActive }))
mockNuxtImport('useFetch', () => (url: string) => ({
  data: url.includes('technical-requests') ? ref({ requests: [] }) : ref({ items: [] }),
  error: ref(null),
  refresh: vi.fn(),
}))
mockNuxtImport('useRequestFetch', () => () => vi.fn())

async function directory(permissions: string[]) {
  ui.permissions = permissions
  ui.users = [
    { id: 'c1', email: 'aisha@example.test', firstName: 'Aisha', lastName: 'Rahman', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], company: null, isActive: true, createdAt: '2026-01-01' },
    { id: 'a1', email: 'sam@example.test', firstName: 'Sam', lastName: 'Lee', role: 'ATTENDEE', roles: ['ATTENDEE'], company: null, isActive: false, createdAt: '2026-01-01' },
  ]
  ui.listUsers.mockReset().mockImplementation(async () => ({ users: ui.users, total: 2, page: 1, pageSize: 25 }))
  ui.setUserActive.mockReset()
  const component = await import('../../frontend/app/components/technical-requirements/UserDirectory.vue')
  const wrapper = await mountSuspended(component.default)
  await flushPromises()
  return wrapper
}

describe('Technical Support user directory', () => {
  it('lists accounts with role labels and status, and searches by name or email', async () => {
    const wrapper = await directory(['users.view', 'users.manage'])
    const table = wrapper.get('[data-testid="user-directory"]')
    expect(table.text()).toContain('Aisha Rahman')
    expect(table.text()).toContain('Coordinator')
    expect(table.text()).toContain('Deactivated')
    await wrapper.get('input[aria-label="Search users"]').setValue('aisha')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(ui.listUsers).toHaveBeenLastCalledWith({ search: 'aisha' })
  })

  it('CS-30 shows the refusal when a Coordinator still has open Events and keeps them active', async () => {
    const wrapper = await directory(['users.view', 'users.manage'])
    ui.setUserActive.mockRejectedValue({ data: { statusCode: 409, data: { error: { code: 'COORDINATOR_HAS_OPEN_EVENTS', message: 'This Coordinator still has 2 open event request(s). Ask the Coordinator Lead to reassign them first.' } } } })
    const deactivate = wrapper.findAll('button').find(button => button.text() === 'Deactivate')!
    await deactivate.trigger('click')
    await flushPromises()
    expect(ui.setUserActive).toHaveBeenCalledWith('c1', false)
    expect(wrapper.get('[role="alert"]').text()).toContain('Ask the Coordinator Lead to reassign them first')
    expect(wrapper.get('[data-testid="user-directory"]').text()).not.toContain('Aisha Rahman Deactivated')
  })

  it('reactivates an account and updates its status', async () => {
    const wrapper = await directory(['users.view', 'users.manage'])
    ui.setUserActive.mockResolvedValue({ ...ui.users[1], isActive: true })
    await wrapper.findAll('button').find(button => button.text() === 'Reactivate')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Sam Lee is now active')
  })

  it('hides the account actions without users.manage', async () => {
    const wrapper = await directory(['users.view'])
    expect(wrapper.findAll('button').some(button => ['Deactivate', 'Reactivate'].includes(button.text()))).toBe(false)
  })
  it('appears as a tab on the Technical Support home only with users.view', async () => {
    ui.listUsers.mockResolvedValue({ users: [], total: 0, page: 1, pageSize: 25 })
    const page = await import('../../frontend/app/pages/technical-requirements/index.vue')
    for (const [permissions, shown] of [[['technical.review', 'users.view'], true], [['technical.review'], false]] as const) {
      ui.permissions = [...permissions]
      const wrapper = await mountSuspended(page.default)
      await flushPromises()
      expect(wrapper.findAll('[role="tab"]').some(tab => tab.text() === 'User directory')).toBe(shown)
    }
  })
})
