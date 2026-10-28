import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-81 — Lead unassigned queue, through the real BFF, service and database.
// Other spec files share this database, so every check scans all pages for its
// own request instead of assuming a position or a total.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

async function queueItem(view: 'unassigned' | 'assigned', id: string) {
  for (let page = 1; ; page++) {
    const res = await api.call('GET', `/api/lead-queue?view=${view}&pageSize=100&page=${page}`, undefined, 'lead')
    expect(res.status).toBe(200)
    const hit = res.body.items.find((i: { id: string }) => i.id === id)
    if (hit) return hit
    if (page * 100 >= res.body.total) return null
  }
}

describe('CS-81 — TC-CS81-01 a first submission is unassigned and waits for the Lead', () => {
  it('has no coordinator and shows up in the Lead queue with the agreed fields', async () => {
    const r = await api.call('POST', '/api/events', valid)
    expect(r.status).toBe(201)
    expect(r.body.coordinatorId ?? null).toBeNull()
    const item = await queueItem('unassigned', r.body.id)
    expect(item).not.toBeNull()
    expect(item).toMatchObject({ eventName: valid.eventName, status: 'SUBMITTED', coordinatorId: null })
    expect(item.organiser.name).toBeTruthy()
    expect(item.submittedAt).toBeTruthy()
    expect(item.expectedAttendance).toBe(valid.expectedAttendance)
  })
})

describe('CS-81 — TC-CS81-02 only Leads see the queue', () => {
  it('returns 403 to Coordinators, Organisers and Attendees', async () => {
    for (const who of ['coord', 'owner', 'attendee'])
      expect((await api.call('GET', '/api/lead-queue?view=unassigned', undefined, who)).status).toBe(403)
  })
})

describe('CS-81 — TC-CS81-03 assigning removes the request from the queue', () => {
  it('moves it to Assigned by me and out of Unassigned', async () => {
    const r = await api.call('POST', '/api/events', valid)
    expect(await queueItem('unassigned', r.body.id)).not.toBeNull()
    const done = await api.call('POST', `/api/events/${r.body.id}/assign`, { coordinatorId: api.users.coord.id, version: r.body.version }, 'lead')
    expect(done.status).toBe(200)
    expect(await queueItem('unassigned', r.body.id)).toBeNull()
    expect(await queueItem('assigned', r.body.id)).not.toBeNull()
  })
})
