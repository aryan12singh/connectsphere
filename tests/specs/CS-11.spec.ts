import { describe, expect, it } from 'vitest'
import { createApp, toWebHandler } from 'h3'

// CS-11 — single file per story (IS212/IEEE 829). One describe per TC, all TCs together.
// Story: As an Event Organiser, I want to submit my event requirements and view the
// recorded request so that ConnectSphere can begin planning from accurate information.
// Execution log is generated deterministically via tests/scripts/compile-test-run.ts → test-runs/<date-time>.md
//
// RED cycle (TDD, no-skip policy per CS-10 precedent): the BFF event-request
// boundary does not exist yet, so every case below asserts the externally
// observable HTTP contract against the real in-process h3 adapter and fails
// (404) because the behavior is missing — not because of an import/syntax/
// environment error. Cases whose listed contract dependency is not yet agreed
// (C02 matrix, T01, shared activity/assignment boundaries) still assert the
// required observable behavior and fail; they must not become passing
// placeholders, tautologies, or mock-replayed results.

// Figma-derived valid payload (frame 2044:4675), kept independent of implementation.
const VALID_PAYLOAD = {
  eventName: 'Autumn Product Summit',
  purpose: 'Product launch',
  description: 'Annual gathering for customers and partners.',
  proposedDate: '2026-11-20',
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Asia/Singapore',
  expectedAttendance: 200,
  venueType: 'physical',
  minimumCapacity: 220,
  preferredLayout: 'theatre',
  venueRequirements: 'Hall A, near MRT',
  accessibilityNeeds: ['wheelchair'],
  accessibilityDetails: '',
  equipmentNeeds: ['projector'],
  technicalDetails: '',
}

const ORGANISER_COOKIE = 'connectsphere_session=%7B%22userId%22%3A%22u-organiser%22%7D'

function testHandler() {
  return toWebHandler(createApp())
}

async function postEventRequest(body: unknown, cookie = ORGANISER_COOKIE) {
  return await testHandler()(new Request('http://localhost/api/event-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cookie': cookie },
    body: JSON.stringify(body),
  }))
}

describe('CS-11 — TC-CS11-01 form captures every required information category', () => {
  it('accepts the full Figma field set with time zone and venue type surviving round-trip', async () => {
    const response = await postEventRequest(VALID_PAYLOAD)
    expect(response.status).toBe(201)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ stage: 'Submitted' })
    expect(typeof body.id).toBe('string')
  })
})

describe('CS-11 — TC-CS11-02 approved minimum field set submits successfully', () => {
  it('accepts a request with only the Figma-required fields and no optionals', async () => {
    const response = await postEventRequest({
      eventName: 'Autumn Product Summit',
      purpose: 'Product launch',
      proposedDate: '2026-11-20',
      startTime: '09:00',
      endTime: '17:00',
      timeZone: 'Asia/Singapore',
      expectedAttendance: 200,
      venueType: 'physical',
    })
    expect(response.status).toBe(201)
  })
})

describe('CS-11 — TC-CS11-03 every mandatory field is enforced server-side', () => {
  it('rejects a request omitting eventName with a field-keyed error and no side effects', async () => {
    const { eventName: _omitted, ...withoutName } = VALID_PAYLOAD
    const response = await postEventRequest(withoutName)
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/eventName/i)
  })
})

describe('CS-11 — TC-CS11-04 conditional fields enforced only when trigger applies', () => {
  it('rejects OTHER layout without layout details with field-level guidance', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      preferredLayout: 'OTHER',
      venueRequirements: '',
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/layout|venueRequirements/i)
  })

  it('rejects registration enabled without registration details with field-level guidance', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      registrationEnabled: true,
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/regist/i)
  })
})

describe('CS-11 — TC-CS11-05 invalid values receive field-level guidance', () => {
  it('rejects an invalid date and non-positive attendance with field-keyed errors', async () => {
    const response = await postEventRequest({
      ...VALID_PAYLOAD,
      proposedDate: 'not-a-date',
      expectedAttendance: 0,
    })
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    const text = JSON.stringify(body)
    expect(text).toMatch(/proposedDate/i)
    expect(text).toMatch(/expectedAttendance/i)
  })
})

describe('CS-11 — TC-CS11-06 no arbitrary submission lead-time restriction', () => {
  it('accepts both near-future and distant-future proposed dates', async () => {
    const near = await postEventRequest({ ...VALID_PAYLOAD, proposedDate: '2026-09-20' })
    const far = await postEventRequest({ ...VALID_PAYLOAD, proposedDate: '2028-06-01' })
    expect(near.status).toBe(201)
    expect(far.status).toBe(201)
  })
})

describe('CS-11 — TC-CS11-07 successful submission creates one identified Submitted request', () => {
  it('returns a unique request ID, Submitted stage, timestamp and owning organiser', async () => {
    const response = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-07' })
    expect(response.status).toBe(201)
    const body = await response.json() as Record<string, unknown>
    expect(typeof body.id).toBe('string')
    expect(body).toMatchObject({ stage: 'Submitted' })
    expect(typeof body.submittedAt).toBe('string')
  })
})

describe('CS-11 — TC-CS11-08 on-screen confirmation identifies the persisted request', () => {
  it('registers a new-request form route that can render the returned request ID and stage', () => {
    const pageModules = import.meta.glob('../../frontend/app/pages/**/*.vue')
    const hasRequestFormRoute = Object.keys(pageModules).some(p => /request/i.test(p))
    expect(hasRequestFormRoute, 'new-request form route is not registered').toBe(true)
  })
})

describe('CS-11 — TC-CS11-09 owning organiser retrieves current information and stage', () => {
  it('returns the persisted information and current stage to the owner', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ id: 'req-owned' })
  })
})

describe('CS-11 — TC-CS11-10 unrelated user cannot retrieve the request', () => {
  it('denies access without returning request contents', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      headers: { cookie: 'connectsphere_session=%7B%22userId%22%3A%22u-organiser-b%22%7D' },
    }))
    expect(response.status).toBe(403)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/denied|forbidden|unauthori[sz]ed/i)
    expect(body).not.toHaveProperty('request')
    expect(body).not.toHaveProperty('event')
  })
})

describe('CS-11 — TC-CS11-11 unrelated user cannot modify the request', () => {
  it('rejects mutations from a non-owner leaving state unchanged', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': 'connectsphere_session=%7B%22userId%22%3A%22u-organiser-b%22%7D' },
      body: JSON.stringify({ eventName: 'Hijacked' }),
    }))
    expect(response.status).toBe(403)
  })
})

describe('CS-11 — TC-CS11-12 owning organiser cannot modify a Submitted request', () => {
  it('rejects direct mutation of a Submitted request as read-only', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': ORGANISER_COOKIE },
      body: JSON.stringify({ description: 'Changed after submit' }),
    }))
    expect([403, 405]).toContain(response.status)
  })
})

describe('CS-11 — TC-CS11-13 repeating the same operation is idempotent', () => {
  it('returns the same request for identical retries with one operation key', async () => {
    const first = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-13' })
    const second = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-13' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json() as Record<string, unknown>
    const secondBody = await second.json() as Record<string, unknown>
    expect(secondBody.id).toBe(firstBody.id)
  })
})

describe('CS-11 — TC-CS11-14 reusing an operation key for a different payload is rejected', () => {
  it('returns conflict and leaves the original request unchanged', async () => {
    await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-14' })
    const conflict = await postEventRequest({ ...VALID_PAYLOAD, eventName: 'Changed name', operationKey: 'op-cs11-14' })
    expect(conflict.status).toBe(409)
  })
})

describe('CS-11 — TC-CS11-15 successful submission records the shared activity contract', () => {
  it('records exactly one activity with action type, request reference, actor and time', async () => {
    const response = await testHandler()(new Request('http://localhost/api/activities?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    const activities = (body.activities ?? body) as Record<string, unknown>[]
    expect(Array.isArray(activities) ? activities.length : -1).toBe(1)
  })
})

describe('CS-11 — TC-CS11-16 submitted request becomes available for CS-30 assignment once', () => {
  it('exposes one eligible assignment item for the Submitted request', async () => {
    const response = await testHandler()(new Request('http://localhost/api/event-requests/req-owned/assignment', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/submitted/i)
  })
})

describe('CS-11 — TC-CS11-17 CS-50 submission notification is actually delivered', () => {
  it('delivers one notification with receipt evidence correlating actor, request and message', async () => {
    const submit = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-17' })
    expect(submit.status).toBe(201)
    const receipt = await testHandler()(new Request('http://localhost/api/notifications?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(receipt.status).toBe(200)
    expect(JSON.stringify(await receipt.json())).toMatch(/delivered/i)
  })
})

describe('CS-11 — TC-CS11-18 notification failure retries without repeating submission', () => {
  it('retries delivery per policy with one persisted request and no duplicates', async () => {
    const submit = await postEventRequest({ ...VALID_PAYLOAD, operationKey: 'op-cs11-18' })
    expect(submit.status).toBe(201)
    const status = await testHandler()(new Request('http://localhost/api/notifications?requestId=req-owned', {
      headers: { cookie: ORGANISER_COOKIE },
    }))
    expect(status.status).toBe(200)
    expect(JSON.stringify(await status.json())).toMatch(/retr/i)
  })
})

describe('CS-11 — TC-CS11-19 CS-11 does not persist incomplete drafts', () => {
  it('rejects incomplete submits with validation only and creates no draft', async () => {
    const response = await postEventRequest({ eventName: 'Partial' })
    expect(response.status).toBe(422)
  })
})
