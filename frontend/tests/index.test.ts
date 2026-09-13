import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtData } from '#app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchEvents } from '@/lib/events'
import IndexPage from '../app/pages/index.vue'
import { makeEventsResponse, makeFullDataset, resetFactorySeq } from './factories'

vi.mock('@/lib/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/events')>()),
  fetchEvents: vi.fn(),
}))

const eventsMock = vi.mocked(fetchEvents)

describe('organiser dashboard page', () => {
  afterEach(async () => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    vi.resetAllMocks()
    resetFactorySeq()
    await clearNuxtData('organiser-events')
  })

  it('renders every event the BFF returns, with a live All count', async () => {
    const dataset = makeFullDataset()
    eventsMock.mockResolvedValue(makeEventsResponse(dataset))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Your events')
    expect(wrapper.text()).toContain('Track your submitted requests and view confirmed arrangements.')
    expect(eventsMock).toHaveBeenCalledOnce()

    expect(wrapper.get('[data-testid="tab-all"]').text()).toContain(`All (${dataset.length})`)
    expect(wrapper.findAll('[data-testid="event-card"]')).toHaveLength(dataset.length)
    for (const event of dataset)
      expect(wrapper.text()).toContain(event.title)
  })

  it('filters events when a status tab is selected', async () => {
    const dataset = makeFullDataset()
    const draft = dataset.find(event => event.status === 'draft')!
    eventsMock.mockResolvedValue(makeEventsResponse(dataset))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // Reka Tabs activates on left mousedown, not click.
    await wrapper.get('[data-testid="tab-draft"]').trigger('mousedown', { button: 0 })
    await flushPromises()

    const cards = wrapper.findAll('[data-testid="event-card"]')
    expect(cards).toHaveLength(1)
    expect(wrapper.text()).toContain(draft.title)
    for (const event of dataset.filter(e => e.status !== 'draft'))
      expect(wrapper.text()).not.toContain(event.title)
  })

  it('shows an empty state when no events match the selected tab', async () => {
    const dataset = makeFullDataset().filter(event => event.status !== 'submitted')
    eventsMock.mockResolvedValue(makeEventsResponse(dataset))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    await wrapper.get('[data-testid="tab-submitted"]').trigger('mousedown', { button: 0 })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="event-card"]')).toHaveLength(0)
    expect(wrapper.get('[role="status"]').text()).toContain('No events')
  })

  it('shows an empty state when the BFF returns zero events', async () => {
    eventsMock.mockResolvedValue(makeEventsResponse([]))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="event-card"]')).toHaveLength(0)
    expect(wrapper.get('[role="status"]').text()).toContain('No events')
  })

  it('announces BFF load errors accessibly', async () => {
    eventsMock.mockRejectedValue(new Error('Service unavailable'))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Service unavailable')
  })

  it('announces malformed BFF payloads accessibly instead of rendering garbage', async () => {
    eventsMock.mockResolvedValue({ events: 'six' } as unknown as ReturnType<typeof makeEventsResponse>)
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="event-card"]')).toHaveLength(0)
    expect(wrapper.get('[role="alert"]').text()).toContain('unavailable')
  })

  it('renders the status badge and details action inside the card footer', async () => {
    const dataset = makeFullDataset()
    const draft = dataset.find(event => event.status === 'draft')!
    eventsMock.mockResolvedValue(makeEventsResponse(dataset))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    const footer = wrapper.get('[data-testid="event-card"] [data-slot="card-footer"]')
    expect(footer.text()).toContain('Draft')
    expect(footer.text()).toContain('View details')
    // CardFooter's [.border-t]:pt-6 outranks p-4 — the frame needs an explicit 16px top override.
    expect(footer.classes()).toContain('pt-4!')
    expect(wrapper.get('[data-testid="event-card"] [data-slot="card-header"]').text()).toContain(draft.title)
  })

  it('shows a live count on every status tab, not just All', async () => {
    const dataset = makeFullDataset()
    eventsMock.mockResolvedValue(makeEventsResponse(dataset))
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    const expected: Record<string, number> = {}
    for (const event of dataset)
      expected[event.status] = (expected[event.status] ?? 0) + 1

    expect(wrapper.get('[data-testid="tab-all"]').text()).toContain(`All (${dataset.length})`)
    // Only statuses with a tab per the frames; planning/rejected surface under All.
    for (const [status, count] of Object.entries(expected)) {
      const tab = wrapper.find(`[data-testid="tab-${status}"]`)
      if (tab.exists())
        expect(tab.text()).toContain(`(${count})`)
    }
    expect(wrapper.get('[data-testid="tab-draft"]').text()).toContain(`(${expected['draft']})`)
  })

  it('lays the tablist out left-aligned with a height that grows with wrapped rows', async () => {
    eventsMock.mockResolvedValue(makeEventsResponse())
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // flex-1 (stretch+center) must be off and the fixed h-9 overridden, or wrapped
    // mobile rows overflow instead of pushing content down.
    const listClasses = wrapper.get('[data-slot="tabs-list"]').classes()
    expect(listClasses).toEqual(expect.arrayContaining(['justify-start', 'flex-wrap', 'gap-y-3', 'h-auto!']))
    expect(wrapper.get('[data-testid="tab-draft"]').classes()).toContain('flex-none')
  })

  it('toggles and persists dark mode from the header', async () => {
    eventsMock.mockResolvedValue(makeEventsResponse())
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    await wrapper.get('[aria-label="Use dark mode"]').trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('connectsphere-theme')).toBe('dark')
  })
})
