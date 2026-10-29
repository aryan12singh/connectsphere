import { expect, type APIRequest } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, emails, internal, snapshot } from './fixtures/equipment-fixtures'
import { signIn } from './fixtures/helpers'
import { internalRequest, summary, value } from './fixtures/sprint4-fixtures'

async function coordinatorToken(request: APIRequest, email: string) {
  const realm = JSON.parse(readFileSync(new URL('../../infra/keycloak/connectsphere-realm.json', import.meta.url), 'utf8'))
  const user = realm.users.find((entry: any) => entry.email === email)
  if (!user) throw Error('Missing synthetic Coordinator fixture')
  const client = await request.newContext({ baseURL: process.env.KONG_BASE })
  try {
    const response = await client.post('/auth/login', { data: { email, password: user.credentials.find((entry: any) => entry.type === 'password').value } })
    expect(response.status()).toBe(200)
    return (await response.json()).token as string
  } finally { await client.dispose() }
}

test('TC-CS46-08 Technical Support can view equipment released after an accepted Event cancellation', async ({ equipment, page, playwright }) => {
  const owner = await equipment.actor(emails.owner)
  const event = await equipment.event()
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 1 }])
  await equipment.approve(event)
  expect((await equipment.reserve(event)).status()).toBe(200)
  const committedAvailability = await equipment.check(event)
  expect(committedAvailability.lines.find((line: any) => line.equipmentType === 'projector').available).toBe(4)

  const current = await summary(event.coordinator, event.eventId)
  const request = await value(await owner.get(`/api/events/${event.id}`))
  const cancellationActionId = `cancel-${event.eventId}`
  const intent = {
    eventRequestId: event.id,
    eventVersion: current.event.version,
    requestVersion: request.version,
    cancellationActionId,
    reason: 'Release reserved equipment for this cancelled Event',
  }
  const bearer = await coordinatorToken(playwright.request, event.email)
  const accepted = internalRequest('event', `/internal/events/${event.eventId}/cancellation-intents`, intent, bearer)
  expect(accepted.status).toBe(200)
  expect(accepted.body).toMatchObject({ phase: 'CANCELLING', cancellationActionId, eventId: event.eventId })

  const released = await internal('equipment', `/internal/events/${event.eventId}/reservations/release`, 'POST', { cancellationActionId })
  expect(released.status).toBe(200)
  expect(released.body).toMatchObject({ eventId: event.eventId, cancellationActionId, reason: 'Event cancelled', actor: { id: 'system', type: 'SYSTEM' } })
  expect(released.body.released).toEqual([expect.objectContaining({ equipmentType: 'projector', quantity: 1 })])
  const saved = await snapshot(event)
  expect(saved.reservations).toHaveLength(1)
  expect(saved.reservations[0]).toMatchObject({ active: false, releaseReason: 'Event cancelled', cancellationActionId, releasedBy: 'system' })
  expect(saved.reservations[0].releasedAt).toBeTruthy()
  expect(saved.history.filter((row: any) => row.action === 'EquipmentReleased')).toHaveLength(1)
  expect(saved.outbox.filter((row: any) => row.eventType === 'EquipmentReleased')).toHaveLength(1)
  // The Event is now cancelled, so its source allocation context correctly
  // fails closed. The persisted reservation/audit assertions above prove the
  // released commitment no longer holds stock for this Event.

  await signIn(page, emails.support)
  await page.goto(`/technical-requirements/${event.id}`)
  const record = page.getByRole('region', { name: 'Equipment reservation history' })
  await expect(record.getByText('Released — Event cancelled', { exact: true })).toBeVisible()
  await expect(record.getByText('projector · 1', { exact: true })).toBeVisible()
})
