import { test, expect, emails, reviewDatabase } from './fixtures/attendance-fixtures'
import { session, signIn } from './fixtures/helpers'
import { createVenue, hold, planningEvent } from './fixtures/venue-fixtures'
import { approve, block, mutation, registrations, safeConfirm, summary, value } from './fixtures/sprint4-fixtures'

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

test('TC-CS49-11 replacing an individual venue preserves registrations and creates no withdrawal or waitlist offer', async ({ page, playwright }, info) => {
  test.setTimeout(360_000)
  const owner = await session(playwright.request, emails.owner)
  const staff = await session(playwright.request, emails.staff)
  const officer = await session(playwright.request, emails.officer)
  const p = await planningEvent(playwright.request, owner, { equipmentNeeds: ['No equipment required'] })
  try {
    const originalVenue = await createVenue(staff)
    const replacementVenue = await createVenue(staff)
    const original = await approve(staff, await hold(p.coordinator, p.event.eventId, originalVenue.id))
    await value(await mutation(p.coordinator, 'PUT', `/api/bookings/events/${p.event.eventId}/primary-venue`, {
      bookingId: original.id, bookingVersion: original.version, version: 0,
    }))
    await safeConfirm(p.coordinator, officer, p.event.eventId, p.event.id)
    await registrations(p.event.eventId, 3, original)
    const before = (await reviewDatabase('attendance', async db => db.query(
      'SELECT id,"userId",status,"registeredAt","withdrawnAt" FROM registrations WHERE "eventId"=$1 ORDER BY id', [p.event.eventId],
    ))).rows

    await block(staff, original)
    await signIn(page, p.contact.email)
    await page.goto(`/events/${p.event.eventId}`)
    await page.locator(`[data-booking-id="${original.id}"]`).getByRole('button', { name: 'Find replacement', exact: true }).click()
    await page.getByLabel('Location', { exact: true }).fill(replacementVenue.name)
    await page.getByRole('button', { name: 'Search available venues', exact: true }).click()
    await page.getByLabel('Change reason', { exact: true }).fill('Use the suitable replacement venue')
    await page.locator('.venue-search-result').filter({ hasText: replacementVenue.name }).getByRole('button', { name: 'Request replacement', exact: true }).click()
    await expect(page.locator(`[data-booking-id="${original.id}"]`)).toContainText('Affected — replacement requested')
    const replacement = (await summary(p.coordinator, p.event.eventId)).items.find((row: any) => row.originalBookingId === original.id)
    expect(replacement.status).toBe('TENTATIVELY_HELD')

    const staffPage = await page.context().newPage()
    try {
      await signIn(staffPage, emails.staff)
      await staffPage.goto('/venue')
      await staffPage.getByRole('button', { name: /Booking requests/ }).click()
      const review = staffPage.locator(`[data-booking-id="${replacement.id}"]`)
      await review.getByLabel('Decision or extension reason').fill('Suitable replacement checked for the full interval')
      await review.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(review).toHaveCount(0)
    } finally {
      await staffPage.close()
    }

    await safeConfirm(p.coordinator, officer, p.event.eventId, p.event.id)
    const after = (await reviewDatabase('attendance', async db => db.query(
      'SELECT id,"userId",status,"registeredAt","withdrawnAt" FROM registrations WHERE "eventId"=$1 ORDER BY id', [p.event.eventId],
    ))).rows
    expect(after).toEqual(before)
    const actions = (await reviewDatabase('attendance', async db => db.query(
      'SELECT kind FROM attendance_outbox WHERE "aggregateId"=$1 ORDER BY kind', [p.event.eventId],
    ))).rows.map((row: any) => row.kind)
    expect(actions).not.toContain('RegistrationWithdrawn')
    expect(actions).not.toContain('WaitlistOfferMade')
    expect((await summary(p.coordinator, p.event.eventId)).primaryVenue.bookingId).toBe(replacement.id)
    await signIn(page, p.contact.email)
    await page.goto(`/events/${p.event.eventId}`)
    await expect(page.locator(`[data-booking-id="${replacement.id}"]`)).toContainText('Venue approved')
    await page.screenshot({ path: info.outputPath('TC-CS49-11-venue-replacement-keeps-registration-records.png'), fullPage: true })
  } finally {
    await owner.dispose()
    await staff.dispose()
    await officer.dispose()
    await p.coordinator.dispose()
  }
})
