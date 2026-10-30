import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-54 — event-service side of whole-Event cancellation: who may cancel, the
// Cancelling phase, and finalizing to Cancelled only after every release is
// confirmed. Releases in other services are proven by their own specs.
const require = createRequire(import.meta.url)
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const approved = async () => {
  const r = await api.submitAssigned(valid)
  const d = await api.call('POST', `/api/events/${r.body.id}/decision`, { decision: 'approve', version: r.body.version }, 'coord')
  expect(d.status).toBe(200)
  return d.body
}
const cancel = (id: string, body: Record<string, unknown>, who = 'coord') =>
  api.call('POST', `/api/events/${id}/cancel`, { cancellationActionId: randomUUID(), reason: 'Speaker withdrew', ...body }, who)
const receipts = (actionId: string, version: number, skip: string[] = []) =>
  ['VENUE', 'EQUIPMENT'].filter(r => !skip.includes(r)).map(resource => ({ resource, receiptId: randomUUID(), cancellationActionId: actionId, eventVersion: version }))

describe('CS-54 — TC-CS54-01 only the assigned Coordinator cancels, with a reason', () => {
  it('refuses others and blank reasons; the Coordinator moves the Event to Cancelling', async () => {
    const r = await approved()
    for (const who of ['owner', 'coord2', 'lead', 'attendee'])
      expect((await cancel(r.id, {}, who)).status).toBe(403)
    expect((await cancel(r.id, { reason: '  ' })).status).toBe(422)
    const actionId = randomUUID()
    const d = await cancel(r.id, { cancellationActionId: actionId })
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ status: 'CANCELLING', cancellationActionId: actionId })
    const again = await cancel(r.id, { cancellationActionId: actionId })
    expect(again.status).toBe(200)
    expect(await api.db.eventCancellationIntent.count({ where: { eventRequestId: r.id } })).toBe(1)
  })
})

describe('CS-54 — TC-CS54-02 the Organiser requests, the Coordinator decides', () => {
  it('a request changes nothing; rejecting keeps the Event; approving starts Cancelling', async () => {
    const r = await approved()
    const ask = (who = 'owner') => api.call('POST', `/api/events/${r.id}/change-requests`, { changeActionId: randomUUID(), scope: 'CANCELLATION', reason: 'Clash with exams' }, who)
    expect((await ask('coord2')).status).toBe(403)
    const first = await ask()
    expect(first.status).toBe(200)
    expect((await api.call('GET', `/api/events/${r.id}`)).body.eventStatus).toBe('ARRANGEMENT_PENDING')
    const no = await api.call('POST', `/api/events/${r.id}/change-requests/${first.body.id}/decision`, { decision: 'reject', reason: 'Still going ahead' }, 'coord')
    expect(no.status).toBe(200)
    expect((await api.call('GET', `/api/events/${r.id}`)).body.eventStatus).toBe('ARRANGEMENT_PENDING')
    const second = await ask()
    const yes = await api.call('POST', `/api/events/${r.id}/change-requests/${second.body.id}/decision`, { decision: 'approve' }, 'coord')
    expect(yes.status).toBe(200)
    expect(await api.db.event.findFirst({ where: { eventRequestId: r.id } })).toMatchObject({ status: 'CANCELLING' })
  })
})

describe('CS-54 — TC-CS54-03 Cancelled only after every release, announced once', () => {
  it('stays Cancelling while a release is missing, then finalizes once and replays safely', async () => {
    const r = await approved()
    const actionId = randomUUID()
    const c = await cancel(r.id, { cancellationActionId: actionId })
    const { finalize } = require('../../services/event-service/src/cancellation')
    await expect(finalize(r.eventId, { cancellationActionId: actionId, receipts: receipts(actionId, c.body.eventVersion, ['EQUIPMENT']) })).rejects.toMatchObject({ status: 409, code: 'RELEASES_INCOMPLETE' })
    expect((await api.db.event.findUnique({ where: { id: r.eventId } })).status).toBe('CANCELLING')
    const done = await finalize(r.eventId, { cancellationActionId: actionId, receipts: receipts(actionId, c.body.eventVersion) })
    expect(done).toMatchObject({ status: 'CANCELLED', replayed: false })
    const again = await finalize(r.eventId, { cancellationActionId: actionId, receipts: [] })
    expect(again).toMatchObject({ status: 'CANCELLED', replayed: true })
    expect(await api.db.outbox.count({ where: { aggregateId: r.eventId, eventType: 'EventCancelled' } })).toBe(1)
    expect((await api.db.event.findUnique({ where: { id: r.eventId } }))).toMatchObject({ status: 'CANCELLED', cancelReason: 'Speaker withdrew' })
  })
})

describe('CS-54 — TC-CS54-04 a cancelled or cancelling Event takes no more changes', () => {
  it('refuses a second cancellation by another action and any change proposal', async () => {
    const r = await approved()
    expect((await cancel(r.id, {})).status).toBe(200)
    expect((await cancel(r.id, {})).status).toBe(409)
    const p = await api.call('POST', `/api/events/${r.id}/change-requests`, { changeActionId: randomUUID(), scope: 'EVENT', reason: 'x', fields: { expectedAttendance: 120 } }, 'owner')
    expect(p.status).toBe(409)
  })
})
