import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-45 — propose, review and apply a significant change, through the real BFF,
// service and database. The booking/equipment services are not part of this spec:
// it covers this service's own data, history and the announcement for them.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const approved = async () => {
  const r = await api.submitAssigned(valid)
  const d = await api.call('POST', `/api/events/${r.body.id}/decision`, { decision: 'approve', version: r.body.version }, 'coord')
  expect(d.status).toBe(200)
  return d.body
}
const propose = (id: string, body: Record<string, unknown>, who = 'owner') =>
  api.call('POST', `/api/events/${id}/change-requests`, { changeActionId: randomUUID(), scope: 'EVENT', affected: [], reason: 'Venue moved', ...body }, who)
const decide = (id: string, cid: string, body: Record<string, unknown>, who = 'coord') =>
  api.call('POST', `/api/events/${id}/change-requests/${cid}/decision`, body, who)

describe('CS-45 — TC-CS45-01 a proposal changes nothing until it is decided', () => {
  it('records old and new values, keeps current values, and allows only one open proposal', async () => {
    const r = await approved()
    const p = await propose(r.id, { fields: { expectedAttendance: 150 } })
    expect(p.status).toBe(201)
    expect(p.body).toMatchObject({ status: 'PENDING', fields: { expectedAttendance: 150 }, previous: { expectedAttendance: 100 } })
    expect((await api.call('GET', `/api/events/${r.id}`)).body.expectedAttendance).toBe(100)
    expect((await propose(r.id, { fields: { expectedAttendance: 160 } })).status).toBe(409)
  })
})

describe('CS-45 — TC-CS45-02 who may propose and decide', () => {
  it('refuses other users; only the assigned Coordinator decides', async () => {
    const r = await approved()
    expect((await propose(r.id, { fields: { expectedAttendance: 120 } }, 'coord2')).status).toBe(403)
    expect((await propose(r.id, { fields: { expectedAttendance: 120 } }, 'attendee')).status).toBe(403)
    const p = await propose(r.id, { fields: { expectedAttendance: 120 } })
    for (const who of ['owner', 'coord2', 'lead'])
      expect((await decide(r.id, p.body.id, { decision: 'approve' }, who)).status).toBe(403)
  })
})

describe('CS-45 — TC-CS45-03 validation', () => {
  it('refuses unknown fields, missing scope target, blank reason and unchanged values', async () => {
    const r = await approved()
    expect((await propose(r.id, { fields: { status: 'CONFIRMED' } })).status).toBe(422)
    expect((await propose(r.id, { scope: 'BOOKING', affected: [], fields: { expectedAttendance: 120 } })).status).toBe(422)
    expect((await propose(r.id, { reason: '  ', fields: { expectedAttendance: 120 } })).status).toBe(422)
    expect((await propose(r.id, { fields: { expectedAttendance: 100 } })).status).toBe(409)
  })
})

describe('CS-45 — TC-CS45-04 rejecting changes nothing', () => {
  it('needs a reason, then leaves the request exactly as it was', async () => {
    const r = await approved()
    const p = await propose(r.id, { fields: { expectedAttendance: 130 } })
    expect((await decide(r.id, p.body.id, { decision: 'reject', reason: ' ' })).status).toBe(422)
    const d = await decide(r.id, p.body.id, { decision: 'reject', reason: 'Not enough room' })
    expect(d.status).toBe(200)
    expect(d.body.status).toBe('REJECTED')
    const seen = (await api.call('GET', `/api/events/${r.id}`)).body
    expect(seen.expectedAttendance).toBe(100)
    expect(seen.version).toBe(r.version)
    expect((await decide(r.id, p.body.id, { decision: 'approve' })).status).toBe(409)
  })
})

describe('CS-45 — TC-CS45-05 approval applies the values, reopens planning and announces once', () => {
  it('applies new values, records history, writes one outbox row, and a retried approval is not applied twice', async () => {
    const r = await approved()
    const p = await propose(r.id, { scope: 'BOOKING', affected: ['booking-1'], fields: { expectedAttendance: 140 } })
    const d = await decide(r.id, p.body.id, { decision: 'approve', reason: 'OK' })
    expect(d.status).toBe(200)
    expect(d.body.status).toBe('APPROVED')
    const seen = (await api.call('GET', `/api/events/${r.id}`)).body
    expect(seen.expectedAttendance).toBe(140)
    expect(seen.version).toBeGreaterThan(r.version)
    expect(await api.db.outbox.count({ where: { aggregateId: r.id, eventType: 'EventChangeApproved' } })).toBe(1)
    expect((await decide(r.id, p.body.id, { decision: 'approve', reason: 'OK' })).status).toBe(200)
    expect(await api.db.outbox.count({ where: { aggregateId: r.id, eventType: 'EventChangeApproved' } })).toBe(1)
    const log = await api.db.activityLog.findMany({ where: { eventRequestId: r.id, action: { in: ['CHANGE_PROPOSED', 'CHANGE_APPROVED'] } } })
    expect(log.map((l: any) => l.action).sort()).toEqual(['CHANGE_APPROVED', 'CHANGE_PROPOSED'])
  })
})

describe('CS-45 — TC-CS45-06 a stale proposal is not applied', () => {
  it('refuses approval when the request changed after the proposal', async () => {
    const r = await approved()
    const first = await propose(r.id, { fields: { expectedAttendance: 110 } })
    const second = await api.call('POST', `/api/events/${r.id}/coordinator-edit`, { description: 'Edited meanwhile', version: r.version }, 'coord')
    expect(second.status).toBe(200)
    expect((await decide(r.id, first.body.id, { decision: 'approve' })).status).toBe(409)
    expect((await api.call('GET', `/api/events/${r.id}`)).body.expectedAttendance).toBe(100)
  })
})
