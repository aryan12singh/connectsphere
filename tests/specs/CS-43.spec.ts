import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eventHarness, valid } from '../helpers/event-api-harness'

// CS-43 — the assigned Coordinator corrects routine wording (description only
// in this slice). Significant changes are CS-45 and are not covered here.
let api: Awaited<ReturnType<typeof eventHarness>>
beforeAll(async () => { api = await eventHarness() })
afterAll(async () => api?.close())

const edit = (id: string, body: Record<string, unknown>, who = 'coord') => api.call('POST', `/api/events/${id}/coordinator-edit`, body, who)

describe('CS-43 — TC-CS43-01 only the assigned Coordinator edits, and the old and new values are recorded', () => {
  it('refuses others, accepts the assigned Coordinator, and writes one history entry', async () => {
    const r = await api.submitAssigned(valid)
    for (const who of ['coord2', 'owner', 'attendee'])
      expect((await edit(r.body.id, { description: 'Reworded', version: r.body.version }, who)).status).toBe(403)
    const d = await edit(r.body.id, { description: 'Reworded by Coordinator', version: r.body.version })
    expect(d.status).toBe(200)
    expect(d.body.description).toBe('Reworded by Coordinator')
    const log = await api.db.activityLog.findMany({ where: { eventRequestId: r.body.id, action: 'COORDINATOR_EDITED' } })
    expect(log).toHaveLength(1)
    expect(JSON.stringify(log[0].details)).toContain('Reworded by Coordinator')
  })
})

describe('CS-43 — TC-CS43-02 significant fields, blank text and stale versions are refused', () => {
  it('refuses dates, blank description and an old version without changing anything', async () => {
    const r = await api.submitAssigned(valid)
    expect((await edit(r.body.id, { startAt: '2030-01-01T10:00:00Z', description: 'x', version: r.body.version })).status).toBe(422)
    expect((await edit(r.body.id, { description: '   ', version: r.body.version })).status).toBe(422)
    expect((await edit(r.body.id, { description: 'x', version: r.body.version - 1 })).status).toBe(409)
    expect(await api.db.activityLog.count({ where: { eventRequestId: r.body.id, action: 'COORDINATOR_EDITED' } })).toBe(0)
  })
})
