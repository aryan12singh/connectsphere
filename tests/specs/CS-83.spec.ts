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

const approved = async (to = 'coord') => {
  const r = await api.submitAssigned(valid, to)
  const d = await api.call('POST', `/api/events/${r.body.id}/decision`, { decision: 'approve', version: r.body.version }, to)
  expect(d.status).toBe(200)
  return d.body
}

describe('CS-83 — TC-CS83-03 the Lead reassigns from the oversight view, which stays read-only', () => {
  it('offers reassign only, applies it with the listed version, and shows the new Coordinator', async () => {
    const r = await api.submitAssigned(valid)
    const { hit } = await oversight(r.body.id)
    expect(hit.allowedActions).toEqual(['reassign'])
    expect((await api.call('POST', `/api/events/${r.body.id}/coordinator-edit`, { description: 'Lead edit', version: hit.version }, 'lead')).status).toBe(403)
    api.directory.push(api.users.coord2.id)
    try {
      const moved = await api.call('POST', `/api/events/${r.body.id}/reassign`, { coordinatorId: api.users.coord2.id, version: hit.version }, 'lead')
      expect(moved.status).toBe(200)
      expect((await oversight(r.body.id)).hit).toMatchObject({ coordinatorId: api.users.coord2.id })
    } finally {
      api.directory.splice(1)
    }
  })
})

describe('CS-83 — TC-CS83-04 a Coordinator cannot open the oversight view', () => {
  it('returns 403 without workload data', async () => {
    for (const who of ['coord', 'coord2', 'safety']) {
      const res = await api.call('GET', '/api/lead-queue?view=oversight', undefined, who)
      expect(res.status).toBe(403)
      expect(JSON.stringify(res.body)).not.toContain('workload')
    }
  })
})

describe('CS-83 — TC-CS83-05 Drafts, Rejected, Cancelled and Completed records are excluded', () => {
  it('lists the Planning Event and none of the closed ones', async () => {
    const draft = await api.call('POST', '/api/events', { ...valid, saveAs: 'draft' })
    const sent = await api.submitAssigned(valid)
    const rejected = await api.call('POST', `/api/events/${sent.body.id}/decision`, { decision: 'reject', version: sent.body.version, notes: 'Out of scope' }, 'coord')
    expect(rejected.body.status).toBe('REJECTED')
    const planning = await approved()
    const cancelled = await approved()
    const completed = await approved()
    // Setup: close two Events directly; the cancel and completion flows have their own stories.
    await api.db.event.update({ where: { id: cancelled.eventId }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    await api.db.event.update({ where: { id: completed.eventId }, data: { status: 'COMPLETED', completedAt: new Date() } })

    expect((await oversight(planning.id)).hit).toMatchObject({ stage: 'ARRANGEMENT_PENDING' })
    for (const id of [draft.body.id, sent.body.id, cancelled.id, completed.id]) expect((await oversight(id)).hit).toBeNull()
  })
})

describe('CS-83 — TC-CS83-09 the status filter returns only that stage', () => {
  it('lists Planning Events only under the Planning filter', async () => {
    const planning = await approved()
    const queued = await api.submitAssigned(valid)
    const { hit, body } = await oversight(planning.id, '&status=ARRANGEMENT_PENDING')
    expect(hit).not.toBeNull()
    expect(new Set(body.items.map((i: { stage: string }) => i.stage))).toEqual(new Set(['ARRANGEMENT_PENDING']))
    expect((await oversight(queued.body.id, '&status=ARRANGEMENT_PENDING')).hit).toBeNull()
    expect((await api.call('GET', '/api/lead-queue?view=oversight&status=BOGUS', undefined, 'lead')).status).toBe(422)
  })
})

describe('CS-83 — TC-CS83-10 outstanding arrangements follow the Event state', () => {
  it('lists arrangements and Safety while Planning, then only what is still open', async () => {
    const r = await approved()
    expect((await oversight(r.id)).hit.outstanding).toEqual(['Venue and technical arrangements', 'Safety review'])
    await api.db.event.update({ where: { id: r.eventId }, data: { safetyState: 'APPROVED' } })
    expect((await oversight(r.id)).hit.outstanding).toEqual(['Event confirmation'])
    await api.db.event.update({ where: { id: r.eventId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } })
    expect((await oversight(r.id)).hit).toMatchObject({ stage: 'CONFIRMED', outstanding: [] })
  })
})
