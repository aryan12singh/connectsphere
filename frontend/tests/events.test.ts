import { describe, expect, it, vi } from 'vitest'
import { fetchEvents, isEventsResponse } from '../app/lib/events'
import { makeEvent, makeEventsResponse } from './factories'

describe('fetchEvents (frontend BFF client)', () => {
  it('gets the organiser events from the BFF events route', async () => {
    const mockResponse = {
      events: [
        { id: 'e1', category: 'CORPORATE EVENT', title: 'Product Summit Launch', meta: 'Date TBC · Capacity 300', status: 'draft' },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchEvents(fetchMock as typeof $fetch)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/events')
    expect(result).toEqual(mockResponse)
  })

  it('throws a friendly error when the BFF cannot load events', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to load events'))

    await expect(fetchEvents(fetchMock as typeof $fetch)).rejects.toThrow('Failed to load events')
  })
})

describe('isEventsResponse (BFF contract)', () => {
  it('accepts any well-formed events payload, not just the mock rows', () => {
    expect(isEventsResponse(makeEventsResponse())).toBe(true)
    expect(isEventsResponse({ events: [] })).toBe(true)
    expect(isEventsResponse({
      events: [makeEvent({ status: 'confirmed', title: 'Prod Gala', meta: 'Real data' })],
    })).toBe(true)
  })

  it('rejects malformed payloads', () => {
    expect(isEventsResponse(null)).toBe(false)
    expect(isEventsResponse({})).toBe(false)
    expect(isEventsResponse({ events: 'six' })).toBe(false)
    expect(isEventsResponse({ events: [{ id: 'x' }] })).toBe(false)
    expect(isEventsResponse({ events: [makeEvent({ status: 'confirmed' }), null] })).toBe(false)
  })
})
