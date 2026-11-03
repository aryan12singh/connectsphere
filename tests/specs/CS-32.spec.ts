import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-32 — status and transition rules through the real BFF, service and
// database. The transition table itself is unit-tested in
// services/event-service/tests/unit/transitions.test.js.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const approved = async () => {
  const r = await api.submitAssigned(valid)
  const d = await api.call('POST', `/api/events/${r.body.id}/decision`, { decision: 'approve', version: r.body.version }, 'coord')
  expect(d.status).toBe(200)
  return d.body
}

describe('CS-32 — TC-CS32-02 each transition records the old and new status, actor and time', () => {
  it('records submit, assign and approve in order', async () => {
    const r = await approved()
    const rows = await api.db.activityLog.findMany({ where: { eventRequestId: r.id }, orderBy: { sequence: 'asc' } })
    const steps = rows.map((row: any) => [row.action, row.fromStatus, row.toStatus, row.actorId])
    expect(steps).toEqual([
      ['SUBMITTED', 'DRAFT', 'SUBMITTED', api.users.owner.id],
      ['COORDINATOR_ASSIGNED', 'SUBMITTED', 'SUBMITTED', api.users.lead.id],
      ['APPROVE', 'SUBMITTED', 'APPROVED', api.users.coord.id],
    ])
    for (const row of rows) expect(row.createdAt).toBeInstanceOf(Date)
    const times = rows.map((row: any) => row.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
    const log = await api.call('GET', `/api/events/${r.id}/activity`, undefined, 'coord')
    expect(log.status).toBe(200)
  })
})

describe('CS-32 — TC-CS32-01 TC-CS31-02 a Confirmed Event is read-only to its Organiser', () => {
  it('shows Confirmed and refuses the Organiser edit with 409', async () => {
    const r = await approved()
    // Setup: confirmation itself is covered by the transition guard and Safety tests.
    await api.db.event.update({ where: { id: r.eventId }, data: { status: 'CONFIRMED', confirmedAt: new Date(), safetyState: 'APPROVED' } })
    const seen = await api.call('GET', `/api/events/${r.id}`)
    expect(seen.body).toMatchObject({ status: 'APPROVED', eventStatus: 'CONFIRMED', statusLabel: 'Confirmed' })
    expect((await api.call('PUT', `/api/events/${r.id}`, { eventName: 'Gala 2', version: seen.body.version })).status).toBe(409)
    expect((await api.db.eventRequest.findUnique({ where: { id: r.id } }))!.eventName).toBe(valid.eventName)
  })
})

describe('CS-32 — TC-CS32-09 closed records allow no further transitions', () => {
  it('refuses decisions on a Rejected request and edits or reassignment on Cancelled and Completed Events', async () => {
    const sent = await api.submitAssigned(valid)
    const rejected = await api.call('POST', `/api/events/${sent.body.id}/decision`, { decision: 'reject', version: sent.body.version, notes: 'Out of scope' }, 'coord')
    expect(rejected.body.status).toBe('REJECTED')
    expect((await api.call('POST', `/api/events/${sent.body.id}/decision`, { decision: 'approve', version: rejected.body.version }, 'coord')).status).toBe(409)

    for (const [status, stamp] of [['CANCELLED', 'cancelledAt'], ['COMPLETED', 'completedAt']] as const) {
      const r = await approved()
      await api.db.event.update({ where: { id: r.eventId }, data: { status, [stamp]: new Date() } })
      const before = await api.db.activityLog.count({ where: { eventRequestId: r.id } })
      expect((await api.call('POST', `/api/events/${r.id}/coordinator-edit`, { description: 'Late edit', version: r.version }, 'coord')).status).toBe(409)
      expect((await api.call('POST', `/api/events/${r.id}/reassign`, { coordinatorId: api.users.coord2.id, version: r.version }, 'lead')).status).toBe(409)
      expect((await api.db.event.findUnique({ where: { id: r.eventId } }))!.status).toBe(status)
      expect(await api.db.activityLog.count({ where: { eventRequestId: r.id } })).toBe(before)
    }
  })
})
