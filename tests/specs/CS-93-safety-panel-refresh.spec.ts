import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import SafetyWorkspace from '../../frontend/app/components/safety/SafetyWorkspace.vue'

// Javier's Event page item: after a venue hold the Safety preparation panel kept
// showing "no venue booking" until the page was reloaded. The arrangements panel
// now bumps a `revision` prop after each venue action and the Safety panel reloads.
const calls = vi.hoisted(() => ({ refresh: [] as string[] }))
const proof = {
  event: { id: 'event-1', title: 'Planning', status: 'ARRANGEMENT_PENDING', version: 3 },
  state: 'NOT_SUBMITTED', canSubmit: false, requirementsRevision: 'r1',
  technical: { status: 'NOT_REQUIRED' }, outstanding: [],
  snapshot: { eventId: 'event-1', eventTitle: 'Planning', venues: [], equipmentStatus: 'NOT_REQUIRED', equipment: [] },
}
mockNuxtImport('useUserSession', () => () => ({ user: ref({ id: 'coordinator', role: 'EVENT_COORDINATOR', roles: ['EVENT_COORDINATOR'], permissions: [] }) }))
mockNuxtImport('useFetch', () => async (path: any) => {
  const url = String(typeof path === 'function' ? path() : path)
  return { data: ref(url.includes('/api/safety/') ? proof : null), error: ref(null), refresh: async () => { calls.refresh.push(url) } }
})

describe('Safety preparation panel reloads after venue actions on the Event page', () => {
  it('reloads its Safety view each time the revision changes, and only then', async () => {
    calls.refresh.length = 0
    const wrapper = await mountSuspended(SafetyWorkspace, { props: { eventId: 'event-1', revision: 0 } })
    expect(calls.refresh).toEqual([])
    await wrapper.setProps({ revision: 1 })
    await vi.waitFor(() => expect(calls.refresh).toEqual(['/api/safety/events/event-1']))
    await wrapper.setProps({ eventId: 'event-1', revision: 1 })
    expect(calls.refresh).toHaveLength(1)
    await wrapper.setProps({ revision: 2 })
    await vi.waitFor(() => expect(calls.refresh).toHaveLength(2))
    wrapper.unmount()
  })

  it('still works where no revision is passed (Safety Officer view)', async () => {
    calls.refresh.length = 0
    const wrapper = await mountSuspended(SafetyWorkspace, { props: { eventId: 'event-1' } })
    expect(calls.refresh).toEqual([])
    wrapper.unmount()
  })
})
