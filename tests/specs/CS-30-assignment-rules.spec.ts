import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-30 AC6, AC7 and AC9 — assignment rules, history and concurrency, through
// the real BFF, service and database. Other spec files share this database,
// so every check looks only at its own request.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const assign = (id: string, coordinatorId: string, version: number, key = randomUUID()) =>
  api.call('POST', `/api/events/${id}/assign`, { coordinatorId, version }, 'lead', key)
const reassign = (id: string, coordinatorId: string, version: number, key = randomUUID()) =>
  api.call('POST', `/api/events/${id}/reassign`, { coordinatorId, version }, 'lead', key)
const logs = (id: string, action: string) => api.db.activityLog.findMany({ where: { eventRequestId: id, action }, orderBy: { createdAt: 'asc' } })
const openAssignments = (id: string) => api.db.coordinatorAssignment.count({ where: { eventRequestId: id, revokedAt: null } })

describe('CS-30 — TC-CS30-20 (AC6) invalid targets and no-op reassignment change nothing', () => {
  it('refuses an inactive Coordinator, the Organiser and the current Coordinator, and writes no history', async () => {
    const r = await api.call('POST', '/api/events', valid)
    const first = await assign(r.body.id, api.users.coord.id, r.body.version)
    expect(first.status).toBe(200)
    // coord2 is not in the active-Coordinator directory unless a test adds it.
    expect((await reassign(r.body.id, api.users.coord2.id, first.body.version)).status).toBe(422)
    expect((await reassign(r.body.id, api.users.owner.id, first.body.version)).status).toBe(422)
    expect((await reassign(r.body.id, api.users.coord.id, first.body.version)).status).toBe(422)
    const seen = await api.call('GET', `/api/events/${r.body.id}`, undefined, 'coord')
    expect(seen.status).toBe(200)
    expect(seen.body.version).toBe(first.body.version)
    expect(await openAssignments(r.body.id)).toBe(1)
    expect(await logs(r.body.id, 'COORDINATOR_REASSIGNED')).toHaveLength(0)
  })
})

describe('CS-30 — TC-CS30-21 (AC7) every assignment and reassignment is in the history', () => {
  it('records old and new Coordinator, the acting Lead and the time', async () => {
    api.directory.push(api.users.coord2.id)
    try {
      const r = await api.call('POST', '/api/events', valid)
      const first = await assign(r.body.id, api.users.coord.id, r.body.version)
      const moved = await reassign(r.body.id, api.users.coord2.id, first.body.version)
      expect(moved.status).toBe(200)
      const [a] = await logs(r.body.id, 'COORDINATOR_ASSIGNED'), [b] = await logs(r.body.id, 'COORDINATOR_REASSIGNED')
      expect(a.actorId).toBe(api.users.lead.id)
      expect(a.details.changes.currentCoordinatorId).toEqual({ old: null, new: api.users.coord.id })
      expect(b.actorId).toBe(api.users.lead.id)
      expect(b.details.changes.currentCoordinatorId).toEqual({ old: api.users.coord.id, new: api.users.coord2.id })
      expect(a.createdAt).toBeTruthy()
      expect(b.createdAt.getTime()).toBeGreaterThanOrEqual(a.createdAt.getTime())
      expect(await openAssignments(r.body.id)).toBe(1)
    }
    finally {
      api.directory.splice(1)
    }
  })
})

describe('CS-30 — TC-CS30-22 (AC9) simultaneous and repeated assignments give one assignment', () => {
  it('three simultaneous assigns: one wins, the others are refused, one history row', async () => {
    const r = await api.call('POST', '/api/events', valid)
    const calls = await Promise.all([1, 2, 3].map(() => assign(r.body.id, api.users.coord.id, r.body.version)))
    const statuses = calls.map(c => c.status)
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(statuses.filter(s => s === 409)).toHaveLength(2)
    expect(await openAssignments(r.body.id)).toBe(1)
    expect(await logs(r.body.id, 'COORDINATOR_ASSIGNED')).toHaveLength(1)
  })
  it('the same operation key sent twice returns the same answer and assigns once', async () => {
    const r = await api.call('POST', '/api/events', valid)
    const key = randomUUID()
    const one = await assign(r.body.id, api.users.coord.id, r.body.version, key)
    const two = await assign(r.body.id, api.users.coord.id, r.body.version, key)
    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(two.body.version).toBe(one.body.version)
    expect(await openAssignments(r.body.id)).toBe(1)
    expect(await logs(r.body.id, 'COORDINATOR_ASSIGNED')).toHaveLength(1)
  })
})
