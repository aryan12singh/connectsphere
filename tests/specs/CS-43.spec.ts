import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
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

const approved = async () => {
  const r = await api.submitAssigned(valid)
  const d = await api.call('POST', `/api/events/${r.body.id}/decision`, { decision: 'approve', version: r.body.version }, 'coord')
  expect(d.status).toBe(200)
  return d.body
}
const edits = (id: string) => api.db.activityLog.count({ where: { eventRequestId: id, action: 'COORDINATOR_EDITED' } })

describe('CS-43 — TC-CS43-03 the Lead and the Safety Officer cannot edit planning details', () => {
  it('refuses both on the Coordinator and Organiser edit routes and changes nothing', async () => {
    const r = await api.submitAssigned(valid)
    for (const who of ['lead', 'safety']) {
      expect((await edit(r.body.id, { description: 'X', version: r.body.version }, who)).status).toBe(403)
      expect((await api.call('PUT', `/api/events/${r.body.id}`, { eventName: 'X', version: r.body.version }, who)).status).toBe(403)
    }
    const after = await api.db.eventRequest.findUnique({ where: { id: r.body.id } })
    expect(after).toMatchObject({ description: valid.description, eventName: valid.eventName, version: r.body.version })
    expect(await edits(r.body.id)).toBe(0)
  })
})

describe('CS-43 — TC-CS43-04 an Organiser edits only their own Draft or Returned request', () => {
  it('saves Draft and Returned, refuses Submitted and other owners, and keeps Drafts private', async () => {
    const draft = await api.call('POST', '/api/events', { ...valid, saveAs: 'draft' })
    expect((await api.call('PUT', `/api/events/${draft.body.id}`, { eventName: 'Gala 2', version: draft.body.version })).status).toBe(200)

    const sent = await api.submitAssigned(valid)
    const back = await api.call('POST', `/api/events/${sent.body.id}/decision`, { decision: 'amendments', version: sent.body.version, notes: 'Add the room plan' }, 'coord')
    expect(back.body.status).toBe('RETURNED_FOR_AMENDMENT')
    expect((await api.call('PUT', `/api/events/${sent.body.id}`, { eventName: 'Gala 2', version: back.body.version })).status).toBe(200)

    const submitted = await api.submitAssigned(valid)
    expect((await api.call('PUT', `/api/events/${submitted.body.id}`, { eventName: 'Gala 2', version: submitted.body.version })).status).toBe(409)

    const theirs = await api.call('POST', '/api/events', { ...valid, saveAs: 'draft' }, 'other')
    expect((await api.call('PUT', `/api/events/${theirs.body.id}`, { eventName: 'Gala 2', version: theirs.body.version })).status).toBe(403)
    for (const who of ['lead', 'safety', 'coord']) expect([403, 404]).toContain((await api.call('GET', `/api/events/${theirs.body.id}`, undefined, who)).status)
  })
})

describe('CS-43 — TC-CS43-05 a significant field cannot be edited directly', () => {
  it('refuses a date change on the edit route and accepts it as a change proposal', async () => {
    const r = await approved()
    const direct = await edit(r.id, { proposedDate: '2028-11-27', version: r.version })
    expect(direct.status).toBe(422)
    expect(JSON.stringify(direct.body)).toMatch(/change proposal/i)
    const proposal = await api.call('POST', `/api/events/${r.id}/change-requests`, { changeActionId: randomUUID(), scope: 'EVENT', affected: [], reason: 'Venue moved', fields: { proposedDate: '2028-11-27' } })
    expect(proposal.status).toBe(200)
    expect(proposal.body.status).toBe('PENDING')
    expect((await api.call('GET', `/api/events/${r.id}`)).body.proposedDate).toBe(valid.proposedDate)
  })
})

describe('CS-43 — TC-CS43-06 a pending change review cannot be bypassed', () => {
  it('refuses attendance and status overwrites while a proposal is pending, leaving it open', async () => {
    const r = await approved()
    const proposal = await api.call('POST', `/api/events/${r.id}/change-requests`, { changeActionId: randomUUID(), scope: 'EVENT', affected: [], reason: 'More guests', fields: { expectedAttendance: 150 } })
    expect(proposal.status).toBe(200)
    expect((await edit(r.id, { expectedAttendance: 500, version: r.version })).status).toBe(422)
    expect((await edit(r.id, { status: 'CONFIRMED', description: 'x', version: r.version })).status).toBe(422)
    expect((await api.call('PUT', `/api/events/${r.id}`, { expectedAttendance: 500, version: r.version })).status).toBe(409)
    const now = (await api.call('GET', `/api/events/${r.id}`)).body
    expect(now).toMatchObject({ expectedAttendance: 100, status: 'APPROVED', eventStatus: 'ARRANGEMENT_PENDING', version: r.version })
    const open = (await api.call('GET', `/api/events/${r.id}/change-requests`)).body
    expect(JSON.stringify(open)).toContain('PENDING')
    expect(await edits(r.id)).toBe(0)
  })
})

describe('CS-43 — TC-CS43-07 a stale version is refused on PostgreSQL', () => {
  it('keeps the newer save and its single history entry', async () => {
    const r = await api.submitAssigned(valid)
    const first = await edit(r.body.id, { description: 'Newer copy', version: r.body.version })
    expect(first.status).toBe(200)
    const stale = await edit(r.body.id, { description: 'Old copy', version: r.body.version })
    expect(stale.status).toBe(409)
    const row = await api.db.eventRequest.findUnique({ where: { id: r.body.id } })
    expect(row).toMatchObject({ description: 'Newer copy', version: first.body.version })
    expect(await edits(r.body.id)).toBe(1)
  })
})

describe('CS-43 — TC-CS43-08 reassignment removes the former Coordinator at once', () => {
  it('refuses the old Coordinator and accepts the new one', async () => {
    const r = await api.submitAssigned(valid)
    api.directory.push(api.users.coord2.id)
    try {
      const moved = await api.call('POST', `/api/events/${r.body.id}/reassign`, { coordinatorId: api.users.coord2.id, version: r.body.version }, 'lead')
      expect(moved.status).toBe(200)
      expect((await edit(r.body.id, { description: 'Old Coordinator', version: moved.body.version })).status).toBe(403)
      const ok = await edit(r.body.id, { description: 'New Coordinator', version: moved.body.version }, 'coord2')
      expect(ok.status).toBe(200)
      expect(ok.body.description).toBe('New Coordinator')
    } finally {
      api.directory.splice(1)
    }
  })
})

describe('CS-43 — TC-CS43-09 invalid, unchanged and retried edits', () => {
  it('refuses invalid text, records nothing for a no-op, and records a retried save once', async () => {
    const r = await api.submitAssigned(valid)
    expect((await edit(r.body.id, { description: 'x'.repeat(5001), version: r.body.version })).status).toBe(422)
    expect((await edit(r.body.id, { description: valid.description, version: r.body.version })).status).toBe(409)
    expect((await api.db.eventRequest.findUnique({ where: { id: r.body.id } }))!.version).toBe(r.body.version)

    const key = randomUUID()
    const body = { description: 'Retried once', version: r.body.version }
    const once = await api.call('POST', `/api/events/${r.body.id}/coordinator-edit`, body, 'coord', key)
    const again = await api.call('POST', `/api/events/${r.body.id}/coordinator-edit`, body, 'coord', key)
    expect([once.status, again.status]).toEqual([200, 200])
    expect(again.body.version).toBe(once.body.version)
    expect(await edits(r.body.id)).toBe(1)
  })
})

describe('CS-43 — TC-CS43-11 edit history stays with people on the request', () => {
  it('shows the edit to the Coordinator and Organiser and refuses Attendees and other Organisers', async () => {
    const r = await api.submitAssigned(valid)
    expect((await edit(r.body.id, { description: 'Private wording', version: r.body.version })).status).toBe(200)
    for (const who of ['coord', 'owner']) {
      const log = await api.call('GET', `/api/events/${r.body.id}/activity`, undefined, who)
      expect(log.status).toBe(200)
      expect(JSON.stringify(log.body)).toContain('Private wording')
    }
    for (const who of ['attendee', 'other']) {
      const denied = await api.call('GET', `/api/events/${r.body.id}/activity`, undefined, who)
      expect([403, 404]).toContain(denied.status)
      expect(JSON.stringify(denied.body)).not.toContain('Private wording')
    }
  })
})

describe('CS-43 — TC-CS43-14 a routine edit on a Confirmed Event keeps it Confirmed', () => {
  it('saves the description without touching the Event status or Safety state', async () => {
    const r = await approved()
    // Setup: move the Event to Confirmed with a current Safety approval.
    await api.db.event.update({ where: { id: r.eventId }, data: { status: 'CONFIRMED', confirmedAt: new Date(), safetyState: 'APPROVED' } })
    const saved = await edit(r.id, { description: 'Doors open 08:30', version: r.version })
    expect(saved.status).toBe(200)
    const event = await api.db.event.findUnique({ where: { id: r.eventId } })
    expect(event).toMatchObject({ status: 'CONFIRMED', safetyState: 'APPROVED', description: 'Doors open 08:30' })
    expect(saved.body).toMatchObject({ status: 'APPROVED', eventStatus: 'CONFIRMED' })
    const log = await api.db.activityLog.findFirst({ where: { eventRequestId: r.id, action: 'COORDINATOR_EDITED' } })
    expect(log!.details).toMatchObject({ changes: { description: { old: valid.description, new: 'Doors open 08:30' } } })
  })
})
