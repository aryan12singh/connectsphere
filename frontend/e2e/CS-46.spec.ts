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
  const availableBeforeReservation = (await equipment.check(event)).lines.find((line: any) => line.equipmentType === 'projector').available
  await equipment.approve(event)
  expect((await equipment.reserve(event)).status()).toBe(200)
  const committedAvailability = await equipment.check(event)
  expect(committedAvailability.lines.find((line: any) => line.equipmentType === 'projector').available).toBe(availableBeforeReservation - 1)

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
  await expect.poll(async () => (await snapshot(event)).outbox.some((row: any) => row.eventType === 'EquipmentReleased' && row.publishedAt)).toBe(true)
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

test('TC-CS46-06 Safety changes requested do not release an active equipment reservation', async ({ equipment, page, browser }, info) => {
  const event = await equipment.event()
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 1 }])
  await equipment.approve(event)
  expect((await equipment.reserve(event)).status()).toBe(200)

  await signIn(page, event.email)
  await page.goto(`/events/${event.eventId}`)
  const safety = page.getByRole('region', { name: 'Safety preparation', exact: true })
  await safety.getByRole('button', { name: 'Send for Safety Check', exact: true }).click()
  await expect(safety).toContainText('Round 1')
  const current = await (await event.coordinator.get(`/api/safety/events/${event.eventId}`)).json()

  const officerPage = await browser.newPage()
  try {
    await signIn(officerPage, emails.officer, undefined, '/safety-checks')
    await officerPage.goto(`/safety-checks/${current.round.id}`)
    const form = officerPage.getByRole('form', { name: 'Safety decision' })
    for (const factor of await form.locator('[data-safety-factor] input').all()) await factor.check()
    await form.getByLabel('Safety decision', { exact: true }).selectOption('REQUEST_CHANGES')
    await form.getByLabel('Actionable comments', { exact: true }).fill('Review the venue access arrangement before proceeding')
    await form.getByLabel('Venue', { exact: true }).check()
    await form.getByRole('button', { name: 'Record Safety decision', exact: true }).click()
    await expect(officerPage.getByText('Decision saved.', { exact: true })).toBeVisible()

    const saved = await snapshot(event)
    expect(saved.reservations.filter((row: any) => row.active)).toHaveLength(1)
    expect(saved.outbox.filter((row: any) => row.eventType === 'EquipmentReleased')).toHaveLength(0)
    await page.reload()
    await expect(safety).toContainText('Review the venue access arrangement before proceeding')
    await page.screenshot({ path: info.outputPath('TC-CS46-06-safety-changes-preserve-reservation.png'), fullPage: true })
  } finally {
    await officerPage.close()
  }
})
