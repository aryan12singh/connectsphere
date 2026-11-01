import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-30 AC5 (Session 3) — a Coordinator cannot hand a request on; they ask the Lead,
// who reassigns or declines. Through the real BFF, service and database. Other spec
// files share this database, so every check looks only at its own request.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const assigned = async () => {
  const r = await api.call('POST', '/api/events', valid)
  const a = await api.call('POST', `/api/events/${r.body.id}/assign`, { coordinatorId: api.users.coord.id, version: r.body.version }, 'lead')
  expect(a.status).toBe(200)
  return a.body
}
const ask = (id: string, body: Record<string, unknown> = {}, who = 'coord') =>
  api.call('POST', `/api/events/${id}/transfer-request`, { transferActionId: randomUUID(), reason: 'On leave next week', ...body }, who)
const decline = (id: string, tid: string, body: Record<string, unknown>, who = 'lead') =>
  api.call('POST', `/api/events/${id}/transfer-request/${tid}/decline`, body, who)
const withdraw = (id: string, tid: string, who = 'coord') =>
  api.call('POST', `/api/events/${id}/transfer-request/${tid}/withdraw`, {}, who)
const leadList = async () => (await api.call('GET', '/api/lead-queue?view=transfers', undefined, 'lead')).body.items as Array<Record<string, any>>
const logs = (id: string, action: string) => api.db.activityLog.findMany({ where: { eventRequestId: id, action } })

describe('CS-30 — TC-CS30-50 only the assigned Coordinator asks, once, with a reason', () => {
  it('records the ask, changes nothing else, and refuses others, blank reasons and a second open ask', async () => {
    const r = await assigned()
    for (const who of ['owner', 'coord2', 'lead', 'attendee'])
      expect((await ask(r.id, {}, who)).status).toBe(403)
    expect((await ask(r.id, { reason: '  ' })).status).toBe(422)
    const asked = await ask(r.id)
    expect(asked.status).toBe(200) // the BFF passes the service's 201 through as 200
    expect(asked.body).toMatchObject({ status: 'PENDING', requestedById: api.users.coord.id, reason: 'On leave next week' })
    expect((await ask(r.id)).status).toBe(409)
    const seen = await api.call('GET', `/api/events/${r.id}`, undefined, 'coord')
    expect(seen.status).toBe(200)
    expect(seen.body.currentCoordinatorId).toBe(api.users.coord.id)
    expect(await logs(r.id, 'TRANSFER_REQUESTED')).toHaveLength(1)
  })
})

describe('CS-30 — TC-CS30-51 the Lead sees the ask and may decline it with a reason', () => {
  it('lists it for the Lead only; a decline needs a reason and leaves the Coordinator in place', async () => {
    const r = await assigned()
    const asked = await ask(r.id)
    const mine = (await leadList()).find(item => item.id === r.id)
    expect(mine).toMatchObject({ allowedActions: ['reassign', 'decline'], transfer: { id: asked.body.id, reason: 'On leave next week' } })
    expect((await api.call('GET', '/api/lead-queue?view=transfers', undefined, 'owner')).status).toBe(403)
    expect((await decline(r.id, asked.body.id, { reason: ' ' })).status).toBe(422)
    for (const who of ['coord', 'owner'])
      expect((await decline(r.id, asked.body.id, { reason: 'No' }, who)).status).toBe(403)
    const done = await decline(r.id, asked.body.id, { reason: 'Nobody else is free' })
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ status: 'DECLINED', decisionReason: 'Nobody else is free', decidedById: api.users.lead.id })
    expect((await leadList()).some(item => item.id === r.id)).toBe(false)
    expect((await api.call('GET', `/api/events/${r.id}`, undefined, 'coord')).body.currentCoordinatorId).toBe(api.users.coord.id)
    expect((await decline(r.id, asked.body.id, { reason: 'Again' }, 'lead')).status).toBe(200) // same Lead, exact replay
    expect((await ask(r.id)).status).toBe(200) // they may ask again afterwards
  })
})

describe('CS-30 — TC-CS30-52 reassigning answers the ask; withdrawing takes it back', () => {
  it('the Lead reassign marks it fulfilled with the new Coordinator and the old one loses access', async () => {
    api.directory.push(api.users.coord2.id)
    try {
      const r = await assigned()
      const asked = await ask(r.id)
      const moved = await api.call('POST', `/api/events/${r.id}/reassign`, { coordinatorId: api.users.coord2.id, version: r.version }, 'lead')
      expect(moved.status).toBe(200)
      const row = await api.db.coordinatorTransferRequest.findUnique({ where: { id: asked.body.id } })
      expect(row).toMatchObject({ status: 'FULFILLED', newCoordinatorId: api.users.coord2.id, decidedById: api.users.lead.id })
      expect((await api.call('GET', `/api/events/${r.id}`, undefined, 'coord')).status).toBe(403)
      expect((await api.call('GET', `/api/events/${r.id}`, undefined, 'coord2')).status).toBe(200)
      expect((await leadList()).some(item => item.id === r.id)).toBe(false)
      expect((await withdraw(r.id, asked.body.id)).status).toBe(409)
    }
    finally {
      api.directory.splice(1)
    }
  })

  it('withdrawing clears the ask; only the requester can; a repeat is harmless', async () => {
    const r = await assigned()
    const asked = await ask(r.id)
    expect((await withdraw(r.id, asked.body.id, 'coord2')).status).toBe(403)
    expect((await withdraw(r.id, asked.body.id)).body.status).toBe('WITHDRAWN')
    expect((await withdraw(r.id, asked.body.id)).status).toBe(200)
    expect((await leadList()).some(item => item.id === r.id)).toBe(false)
    expect(await logs(r.id, 'TRANSFER_WITHDRAWN')).toHaveLength(1)
  })

  it('an ask on a closed request is refused', async () => {
    const r = await assigned()
    const rejected = await api.call('POST', `/api/events/${r.id}/decision`, { decision: 'reject', version: r.version, reason: 'Not feasible' }, 'coord')
    expect(rejected.status).toBe(200)
    expect((await ask(r.id)).status).toBe(409)
  })
})
