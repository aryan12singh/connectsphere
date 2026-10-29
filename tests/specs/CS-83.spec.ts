import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-83 — Lead oversight of active Events, through the real BFF, service and
// database. Other spec files share this database, so every check scans all
// pages for its own request instead of assuming a position or a total.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

async function oversight(id: string, filter = '') {
  for (let page = 1; ; page++) {
    const res = await api.call('GET', `/api/lead-queue?view=oversight&pageSize=100&page=${page}${filter}`, undefined, 'lead')
    expect(res.status).toBe(200)
    const hit = res.body.items.find((i: { id: string }) => i.id === id)
    if (hit) return { hit, body: res.body }
    if (page * 100 >= res.body.total) return { hit: null, body: res.body }
  }
}

describe('CS-83 — TC-CS83-01 only Leads see the oversight view', () => {
  it('returns 403 to Coordinators, Organisers and Attendees', async () => {
    for (const who of ['coord', 'owner', 'attendee'])
      expect((await api.call('GET', '/api/lead-queue?view=oversight', undefined, who)).status).toBe(403)
  })
})

describe('CS-83 — TC-CS83-02 assigned work appears with its status, outstanding items and workload', () => {
  it('lists an assigned request, hides an unassigned one, and filters by Coordinator', async () => {
    const unassigned = await api.call('POST', '/api/events', valid)
    const r = await api.call('POST', '/api/events', valid)
    const done = await api.call('POST', `/api/events/${r.body.id}/assign`, { coordinatorId: api.users.coord.id, version: r.body.version }, 'lead')
    expect(done.status).toBe(200)

    expect((await oversight(unassigned.body.id)).hit).toBeNull()
    const { hit, body } = await oversight(r.body.id)
    expect(hit).toMatchObject({ id: r.body.id, coordinatorId: api.users.coord.id, stage: 'SUBMITTED' })
    expect(hit.statusLabel).toBeTruthy()
    expect(hit.outstanding).toContain('Coordinator decision')
    expect(body.workload.find((w: { coordinatorId: string }) => w.coordinatorId === api.users.coord.id)?.active).toBeGreaterThan(0)

    const mine = await oversight(r.body.id, `&coordinatorId=${api.users.coord.id}`)
    expect(mine.hit).not.toBeNull()
    const other = await oversight(r.body.id, '&coordinatorId=00000000-0000-0000-0000-000000000000')
    expect(other.hit).toBeNull()
    const wrongStage = await oversight(r.body.id, '&status=CONFIRMED')
    expect(wrongStage.hit).toBeNull()
  })
})
