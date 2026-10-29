import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-12 — Review, approve, reject or return an assigned request, through the
// real BFF, service and database. Other spec files share this database, so
// every check looks only at its own request.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const decide = (id: string, body: Record<string, unknown>, who = 'coord') => api.call('POST', `/api/events/${id}/decision`, body, who)
const outboxCount = (id: string, eventType: string) => api.db.outbox.count({ where: { aggregateId: id, eventType } })

describe('CS-12 — TC-CS12-01 only the assigned Coordinator approves', () => {
  it('refuses another Coordinator, the Organiser and a Lead; the assigned one creates one Planning Event', async () => {
    const r = await api.submitAssigned(valid)
    for (const who of ['coord2', 'owner', 'lead', 'attendee'])
      expect((await decide(r.body.id, { decision: 'approve', version: r.body.version }, who)).status).toBe(403)
    const d = await decide(r.body.id, { decision: 'approve', version: r.body.version })
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ status: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING', statusLabel: 'Planning' })
    expect(d.body.eventId).not.toBe(r.body.id)
  })
})

describe('CS-12 — TC-CS12-02 approval is shown as Planning and written once to the outbox', () => {
  it('the Organiser sees Planning, never Confirmed, and RequestApproved is written once', async () => {
    const r = await api.submitAssigned(valid)
    await decide(r.body.id, { decision: 'approve', version: r.body.version })
    const seen = await api.call('GET', `/api/events/${r.body.id}`)
    expect(seen.status).toBe(200)
    expect(seen.body.statusLabel).toBe('Planning')
    expect(seen.body.eventStatus).not.toBe('CONFIRMED')
    expect(await outboxCount(r.body.id, 'RequestApproved')).toBe(1)
  })
})

describe('CS-12 — TC-CS12-03 simultaneous approvals give one transition', () => {
  it('one call wins, the others are refused, and there is one Event and one outbox row', async () => {
    const r = await api.submitAssigned(valid)
    const calls = await Promise.all([1, 2, 3].map(() => decide(r.body.id, { decision: 'approve', version: r.body.version })))
    const statuses = calls.map(c => c.status).sort()
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(statuses.filter(s => s === 409)).toHaveLength(2)
    expect(await api.db.event.count({ where: { eventRequestId: r.body.id } })).toBe(1)
    expect(await outboxCount(r.body.id, 'RequestApproved')).toBe(1)
  })
})

describe('CS-12 — TC-CS12-04 a stale version is refused and changes nothing', () => {
  it('returns 409 for an old version and leaves the request Submitted', async () => {
    const r = await api.submitAssigned(valid)
    expect(r.body.version).toBeGreaterThan(1)
    expect((await decide(r.body.id, { decision: 'approve', version: r.body.version - 1 })).status).toBe(409)
    expect((await api.call('GET', `/api/events/${r.body.id}`)).body.status).toBe('SUBMITTED')
  })
})

describe('CS-12 — TC-CS12-05 reject needs a reason, closes the request and tells the Organiser why', () => {
  it('blank reason is refused; a reason closes it; later decisions are 409', async () => {
    const r = await api.submitAssigned(valid)
    expect((await decide(r.body.id, { decision: 'reject', version: r.body.version, reason: '   ' })).status).toBe(422)
    const d = await decide(r.body.id, { decision: 'reject', version: r.body.version, reason: 'No venue fits' })
    expect(d.status).toBe(200)
    const seen = (await api.call('GET', `/api/events/${r.body.id}`)).body
    expect(seen).toMatchObject({ status: 'REJECTED', decisionReason: 'No venue fits' })
    expect((await decide(r.body.id, { decision: 'approve', version: d.body.version })).status).toBe(409)
    expect(await outboxCount(r.body.id, 'RequestRejected')).toBe(1)
  })
})

describe('CS-12 — TC-CS12-06 return needs comments and keeps the same Coordinator', () => {
  it('blank comments are refused; comments return it for amendment; it cannot then be approved', async () => {
    const r = await api.submitAssigned(valid)
    expect((await decide(r.body.id, { decision: 'amendments', version: r.body.version })).status).toBe(422)
    const d = await decide(r.body.id, { decision: 'amendments', version: r.body.version, comments: 'Add a budget' })
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ status: 'RETURNED_FOR_AMENDMENT', decisionReason: 'Add a budget' })
    expect((await decide(r.body.id, { decision: 'approve', version: d.body.version })).status).toBe(409)
    expect(await outboxCount(r.body.id, 'RequestReturned')).toBe(1)
  })
})

describe('CS-12 — TC-CS12-07 a Planning-stage rejection closes the request and the Event together', () => {
  it('rejecting an approved request in Planning closes both and tells the Organiser why', async () => {
    const r = await api.submitAssigned(valid)
    const approved = await decide(r.body.id, { decision: 'approve', version: r.body.version })
    expect(approved.status).toBe(200)
    expect((await decide(r.body.id, { decision: 'reject', version: approved.body.version })).status).toBe(422)
    const d = await decide(r.body.id, { decision: 'reject', version: approved.body.version, reason: 'Cannot be met' })
    expect(d.status).toBe(200)
    const ev = await api.db.event.findFirst({ where: { eventRequestId: r.body.id } })
    expect(ev?.status).toBe('REJECTED')
    expect((await api.call('GET', `/api/events/${r.body.id}`)).body.status).toBe('REJECTED')
    expect((await decide(r.body.id, { decision: 'reject', version: d.body.version, reason: 'Again' })).status).toBe(409)
  })
})
