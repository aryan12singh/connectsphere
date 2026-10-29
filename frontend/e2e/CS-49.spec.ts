import { test, expect, emails, reviewDatabase } from './fixtures/attendance-fixtures'
import { signIn } from './fixtures/helpers'

test('TC-CS49-13 Attendee withdraws from a normal registered Event in My registrations', async ({ attendance, page }) => {
  const event = await attendance.event({ registrationLimit: 2 })
  const opensAt = new Date(Date.now() - 60 * 60_000).toISOString()
  const closesAt = new Date(Date.now() + 60 * 60_000).toISOString()
  const cutoffAt = new Date(Date.now() + 30 * 60_000).toISOString()
  await reviewDatabase('event', async db => db.query(
    'UPDATE event_requests SET "registrationOpensAt"=$2,"registrationClosesAt"=$3 WHERE id=$1',
    [event.id, opensAt, closesAt],
  ))
  await reviewDatabase('attendance', async db => db.query(
    'UPDATE events SET "registrationEnabled"=true,"registrationWindow"=$2::jsonb,"withdrawalEnabled"=true,"withdrawalCutoffAt"=$3 WHERE "eventId"=$1',
    [event.eventId, JSON.stringify({ startAt: opensAt, endAt: closesAt }), cutoffAt],
  ))

  await signIn(page, emails.attendee)
  await page.goto(`/attendances/events/${event.eventId}`)
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(page.getByText('You are registered for this event.', { exact: true })).toBeVisible()

  await page.goto('/attendances/registrations')
  const registration = page.locator('li').filter({ hasText: event.eventName })
  await expect(registration.getByText('Registered', { exact: true })).toBeVisible()
  const attendeeId = await attendance.actorId(emails.attendee)
  const saved = await reviewDatabase('attendance', async db => db.query(
    'SELECT id FROM registrations WHERE "eventId"=$1 AND "userId"=$2 AND status=\'CONFIRMED\'',
    [event.eventId, attendeeId],
  ).then(result => result.rows[0]))
  expect(saved?.id).toEqual(expect.any(String))

  page.once('dialog', dialog => dialog.accept())
  await registration.getByRole('button', { name: `Withdraw registration for ${event.eventName}` }).click()
  await expect(registration.getByText('Withdrawn', { exact: true })).toBeVisible()
  const eventDetail = await attendance.checkDetail(event.eventId, await attendance.actor(emails.attendee))
  expect(eventDetail.status()).toBe(200)
  expect((await eventDetail.json()).placesRemaining).toBe(2)

  const state = await reviewDatabase('attendance', async db => ({
    registrations: (await db.query('SELECT status,"withdrawnAt" FROM registrations WHERE id=$1', [saved.id])).rows,
    actions: (await db.query('SELECT kind,payload FROM attendance_outbox WHERE "aggregateId"=$1 AND kind=\'RegistrationWithdrawn\'', [event.eventId])).rows,
  }))
  expect(state.registrations).toHaveLength(1)
  expect(state.registrations[0].status).toBe('WITHDRAWN')
  expect(state.registrations[0].withdrawnAt).not.toBeNull()
  expect(state.actions).toHaveLength(1)
  expect(state.actions[0].payload.registrationId).toBe(saved.id)
})
