import { randomUUID } from 'node:crypto'
import { test, expect, emails, snapshot, fault, internal, mutation, reviewDatabase, reservePath, serviceAction } from './equipment-fixtures'
import { signIn } from './helpers'
import { createVenue, hold } from './venue-fixtures'

test('TC-CS42-01: Support reserves every approved line with provenance and one logical action', async ({ equipment, page }, info) => {
  await equipment.stock('projector', 5); await equipment.stock('speaker', 5)
  const event = await equipment.event(); await equipment.submit(event, [{ equipmentType: 'projector', quantity: 2 }, { equipmentType: 'speaker', quantity: 1 }]); await equipment.approve(event)
  expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.reason).toBe('RESERVATION_PROOF_MISSING')
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  await page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }).click()
  await page.getByRole('button', { name: 'Reserve complete request', exact: true }).click()
  await expect(page.getByText('Complete current equipment reservation saved.', { exact: true })).toBeVisible()
  const saved = await snapshot(event)
  expect(saved.reservations).toHaveLength(2)
  expect(saved.reservations.map((row: any) => [row.equipmentType, row.quantity]).sort()).toEqual([['projector', 2], ['speaker', 1]])
  for (const row of saved.reservations) {
    expect(row).toMatchObject({ eventId: event.eventId, requestVersion: 1, active: true, actorId: expect.any(String) })
    expect(new Date(row.startAt).toISOString()).toBe(event.period.startAt)
    expect(new Date(row.endAt).toISOString()).toBe(event.period.endAt)
    expect(row.sourceVersions).toMatchObject({ requirementsRevision: expect.any(String), allocations: expect.any(Array) })
  }
  expect(saved.history.filter((row: any) => row.action === 'EquipmentReserved')).toHaveLength(1)
  expect(saved.outbox.filter((row: any) => row.eventType === 'EquipmentReserved')).toHaveLength(1)
  expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.status).toBe('APPROVED')
  await page.screenshot({ path: info.outputPath('TC-CS42-01-reserved.png'), fullPage: true })
})

test('TC-CS42-13: reservation action remains available before approval and shows the service rejection', async ({ equipment, page }) => {
  const event = await equipment.event()
  await equipment.submit(event)
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  await page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }).click()
  const reserveButton = page.getByRole('button', { name: 'Reserve complete request', exact: true })
  await expect(reserveButton).toBeEnabled()
  const reservationResponse = page.waitForResponse(response => response.url().includes(`/api/equipment/requests/${event.id}/reserve`) && response.request().method() === 'POST')
  await reserveButton.click()
  expect((await reservationResponse).status()).toBe(409)
  await expect(page.getByRole('alert')).toBeVisible()
})

test('TC-CS42-02: any short line returns all shortages without reserving sufficient lines', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event, [{ equipmentType: 'speaker', quantity: 1 }, { equipmentType: 'projector', quantity: 4 }]); await equipment.approve(event)
  expect((await equipment.operation(event, 2)).status()).toBe(200)
  const before = await snapshot(event); const response = await equipment.reserve(event)
  expect(response.status()).toBe(409)
  const failure = await response.json(); const lines = failure.data?.error?.lines ?? failure.error?.lines
  expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ equipmentType: 'speaker', shortfall: 0 }), expect.objectContaining({ equipmentType: 'projector', shortfall: 1 })]))
  expect(await snapshot(event)).toEqual(before)
})

test('TC-CS42-03: pending, superseded and obsolete approvals cannot reserve equipment', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event)
  expect((await equipment.reserve(event)).status()).toBe(409)
  await equipment.approve(event); await equipment.submit(event, [{ equipmentType: 'projector', quantity: 3 }])
  const before = await snapshot(event)
  expect((await equipment.reserve(event, 1)).status()).toBe(409)
  expect((await equipment.reserve(event, 2)).status()).toBe(409)
  expect(await snapshot(event)).toEqual(before)
})

test('TC-CS42-04: every non-Support reservation attempt is denied without side effects', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event)
  const before = await snapshot(event)
  for (const actor of [event.coordinator, await equipment.actor(emails.owner), await equipment.actor(emails.attendee), await equipment.actor(emails.officer)]) expect((await mutation(actor, 'POST', reservePath(event), { version: 1 })).status()).toBe(403)
  expect(await snapshot(event)).toEqual(before)
})

test('TC-CS42-05: reservation rechecks buffered touching, overlapping and operational windows', async ({ equipment }) => {
  const first = await equipment.event(); await equipment.submit(first, [{ equipmentType: 'projector', quantity: 5 }]); await equipment.approve(first)
  expect((await equipment.reserve(first)).status()).toBe(200)
  const adjacent = await equipment.event({ date: first.date, startAt: `${first.date}T05:15:00Z`, endAt: `${first.date}T06:00:00Z` })
  await equipment.submit(adjacent, [{ equipmentType: 'projector', quantity: 1 }]); await equipment.approve(adjacent)
  expect((await equipment.reserve(adjacent)).status()).toBe(200)
  const overlap = await equipment.event({ date: first.date, startAt: `${first.date}T05:14:00Z`, endAt: `${first.date}T06:00:00Z` })
  await equipment.submit(overlap, [{ equipmentType: 'projector', quantity: 1 }]); await equipment.approve(overlap)
  expect((await equipment.reserve(overlap)).status()).toBe(409)
  const operation = await equipment.event(); await equipment.submit(operation, [{ equipmentType: 'projector', quantity: 5 }]); await equipment.approve(operation)
  expect((await equipment.operation(operation)).status()).toBe(200)
  expect((await equipment.reserve(operation)).status()).toBe(409)
})

test('TC-CS42-06: multiple rooms reserve the pooled Event quantity once', async ({ equipment }) => {
  const event = await equipment.event({ rooms: 2 }); await equipment.submit(event); await equipment.approve(event)
  expect((await equipment.reserve(event)).status()).toBe(200)
  const saved = await snapshot(event)
  expect(saved.reservations).toHaveLength(1); expect(saved.reservations[0].quantity).toBe(2)
  expect(saved.reservations[0].sourceVersions.allocations).toHaveLength(2)
})

test('TC-CS42-07: two simultaneous Events demanding two of stock three cannot overcommit', async ({ equipment }) => {
  await equipment.stock('projector', 3)
  const first = await equipment.event(); const second = await equipment.event({ date: first.date })
  for (const event of [first, second]) { await equipment.submit(event); await equipment.approve(event) }
  const results = await Promise.all([equipment.reserve(first), equipment.reserve(second)])
  expect(results.map(result => result.status()).sort()).toEqual([200, 409])
  const rows = [...(await snapshot(first)).reservations, ...(await snapshot(second)).reservations]
  expect(rows.filter((row: any) => row.active).reduce((total: number, row: any) => total + row.quantity, 0)).toBe(2)
  await equipment.stock('projector', 5)
})

test('TC-CS42-08: retrying one command returns the same reservation without new actions', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event); const key = randomUUID()
  const first = await equipment.reserve(event, 1, key); expect(first.status()).toBe(200)
  const before = await snapshot(event)
  const replay = await equipment.reserve(event, 1, key); expect(replay.status()).toBe(200)
  const firstBody = await first.json(); const secondBody = await replay.json()
  expect(secondBody.reservations).toEqual(firstBody.reservations)
  expect(await snapshot(event)).toEqual(before)
})

test('TC-CS42-09: an outbox failure rolls back every reservation line and retry recovers once', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event, [{ equipmentType: 'projector', quantity: 2 }, { equipmentType: 'speaker', quantity: 1 }]); await equipment.approve(event)
  const before = await snapshot(event); const key = randomUUID()
  await fault(event, 'EquipmentReserved', async () => {
    expect((await equipment.reserve(event, 1, key)).status()).toBe(500)
    expect(await snapshot(event)).toEqual(before)
  })
  expect((await equipment.reserve(event, 1, key)).status()).toBe(200)
  expect((await snapshot(event)).reservations).toHaveLength(2)
})

test('TC-CS42-10: broker outage and Equipment restart preserve durable proof and retry identity', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event); const key = randomUUID()
  serviceAction('rabbitmq', 'stop')
  try {
    expect((await equipment.reserve(event, 1, key)).status()).toBe(200)
    const before = await snapshot(event)
    expect(before.outbox.filter((row: any) => row.eventType === 'EquipmentReserved')).toHaveLength(1)
    serviceAction('equipment-service', 'restart')
    await expect.poll(async () => (await internal('equipment', `/internal/events/${event.eventId}/readiness`).catch(() => ({ status: 503 }))).status, { timeout: 45_000 }).toBe(200)
    expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.status).toBe('APPROVED')
    expect((await equipment.reserve(event, 1, key)).status()).toBe(200)
    expect(await snapshot(event)).toEqual(before)
  } finally { serviceAction('rabbitmq', 'start') }
})

test('TC-CS42-11: individual Booking changes, expiry and Safety rework retain Equipment commitments', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event); expect((await equipment.reserve(event)).status()).toBe(200)
  const before = await snapshot(event); const staff = await equipment.actor(emails.staff); const venue = await createVenue(staff)
  const extra = await hold(event.coordinator, event.eventId, venue.id, { startAt: `${event.date}T06:00:00Z`, endAt: `${event.date}T07:00:00Z` })
  // Establish dependency-owned expiry and rework states, then assert only Equipment outcomes.
  await reviewDatabase('booking', pool => pool.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp() WHERE id=$1', [extra.id]))
  const individual = await hold(event.coordinator, event.eventId, venue.id, { startAt: `${event.date}T06:00:00Z`, endAt: `${event.date}T07:00:00Z` })
  expect((await mutation(event.coordinator, 'PUT', `/api/bookings/${individual.id}`, { ...individual, status: 'CANCELLED', reason: 'Release only this additional tentative room' })).status()).toBe(200)
  await reviewDatabase('event', pool => pool.query('UPDATE events SET "safetyState"=\'CHANGES_REQUIRED\' WHERE id=$1', [event.eventId]))
  expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.status).toBe('APPROVED')
  expect((await snapshot(event)).reservations).toEqual(before.reservations)
})

test('TC-CS42-12: an approved technical revision replaces atomically and failed replacement retains old commitments', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event); expect((await equipment.reserve(event)).status()).toBe(200)
  const original = (await snapshot(event)).reservations
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 4 }]); await equipment.approve(event, 2)
  expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.status).toBe('PENDING')
  await equipment.stock('projector', 3)
  expect((await equipment.reserve(event, 2)).status()).toBe(409)
  expect((await snapshot(event)).reservations).toEqual(original)
  await equipment.stock('projector', 5)
  expect((await equipment.reserve(event, 2)).status()).toBe(200)
  const replaced = (await snapshot(event)).reservations
  expect(replaced.filter((row: any) => row.active)).toHaveLength(1)
  expect(replaced.find((row: any) => row.active)).toMatchObject({ requestVersion: 2, quantity: 4 })
  expect(replaced.find((row: any) => row.id === original[0].id).active).toBe(false)
})
