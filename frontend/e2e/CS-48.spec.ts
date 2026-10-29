import { test, expect, emails, reviewDatabase, mutation, serviceAction } from './fixtures/attendance-fixtures'
import { signIn } from './fixtures/helpers'

async function openRegistration(eventId: string, requestId: string) {
  const startAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const endAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
  await reviewDatabase('event', async db => db.query(
    'UPDATE event_requests SET "registrationOpensAt"=$2,"registrationClosesAt"=$3 WHERE id=$1',
    [requestId, startAt, endAt],
  ))
  await reviewDatabase('attendance', async db => db.query(
    'UPDATE events SET "registrationEnabled"=true,"registrationWindow"=$2::jsonb WHERE "eventId"=$1',
    [eventId, JSON.stringify({ startAt, endAt })],
  ))
}

test('TC-CS48-01 / TC-CS48-03 Attendee registers, signs back in, and sees their saved status and remaining capacity', async ({ attendance, page }, info) => {
  const event = await attendance.event({ date: '2026-10-30', registrationLimit: 1 })
  await openRegistration(event.eventId, event.id)
  const attendeeId = await attendance.actorId(emails.attendee)
  await signIn(page, emails.attendee)
  await page.goto(`/attendances/events/${event.eventId}`)
  const capacity = page.getByRole('region', { name: 'Registration capacity' })
  await expect(capacity.getByText('1 attendee', { exact: true })).toBeVisible()
  await expect(capacity.getByText('1 place left', { exact: true })).toBeVisible()
  const registrationResponse = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith(`/api/attendances/events/${event.eventId}/registrations`))
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  expect((await registrationResponse).status()).toBe(201)
  const registrationSuccess = capacity.getByText('You are registered for this event.', { exact: true })
  await expect(registrationSuccess).toBeVisible()
  await expect(registrationSuccess).not.toHaveClass(/sr-only/)
  await expect(capacity.getByTestId('registration-primary-action')).toHaveText('My registrations')
  await expect(capacity.getByText('0 places left', { exact: true })).toBeVisible()
  await capacity.getByTestId('registration-primary-action').click()
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'My registrations', selected: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Events you registered for' })).toHaveCount(0)
  const registrationCard = page.getByRole('link', { name: new RegExp(event.eventName) })
  await expect(registrationCard).toContainText('Date & time')
  await expect(registrationCard).toContainText('Primary location')
  await expect(registrationCard).not.toContainText('Registration limit')
  await expect(registrationCard).toContainText('Registered')
  await page.context().clearCookies()
  await signIn(page, emails.attendee)
  await page.goto('/attendances/registrations')
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'My registrations', selected: true })).toBeVisible()
  const signedInRegistrationCard = page.getByRole('link', { name: new RegExp(event.eventName) })
  await expect(signedInRegistrationCard).toBeVisible()
  await expect(signedInRegistrationCard).toContainText('Registered')
  await page.screenshot({ path: info.outputPath('TC-CS48-03-registered-after-sign-in.png'), fullPage: true })
  const state = await reviewDatabase('attendance', async db => ({
    registrations: (await db.query('SELECT id,status FROM registrations WHERE "eventId"=$1 AND "userId"=$2', [event.eventId, attendeeId])).rows,
    actions: (await db.query('SELECT id,kind,"deliveredAt",payload FROM attendance_outbox WHERE "aggregateId"=$1', [event.eventId])).rows,
  }))
  expect(state.registrations).toHaveLength(1)
  expect(state.registrations[0].status).toBe('CONFIRMED')
  expect(state.actions).toHaveLength(1)
  expect(state.actions[0].kind).toBe('RegistrationCreated')
  await expect.poll(() => reviewDatabase('attendance', async db => db.query(
    'SELECT "deliveredAt" FROM attendance_outbox WHERE "aggregateId"=$1', [event.eventId],
  ).then(result => Boolean(result.rows[0]?.deliveredAt)))).toBe(true)
})

test('TC-CS48-05 simultaneous last-place registrations admit only one Attendee', async ({ attendance }) => {
  const event = await attendance.event({ date: '2026-10-30', registrationLimit: 1 })
  await openRegistration(event.eventId, event.id)
  const [first, second] = await Promise.all([attendance.actor(emails.attendee), attendance.actor(emails.otherAttendee)])
  const path = `/api/attendances/events/${event.eventId}/registrations`
  const responses = await Promise.all([
    mutation(first, 'POST', path, {}),
    mutation(second, 'POST', path, {}),
  ])
  expect(responses.map(response => response.status()).sort()).toEqual([201, 409])
  const state = await reviewDatabase('attendance', async db => ({
    registrations: (await db.query('SELECT status FROM registrations WHERE "eventId"=$1', [event.eventId])).rows,
    actions: (await db.query('SELECT kind FROM attendance_outbox WHERE "aggregateId"=$1', [event.eventId])).rows,
  }))
  expect(state.registrations).toEqual([{ status: 'CONFIRMED' }])
  expect(state.actions).toEqual([{ kind: 'RegistrationCreated' }])
})

test('TC-CS48-02 current Coordinator sets the registration limit and the Attendee sees the limit and places left', async ({ attendance, page }) => {
  const event = await attendance.event({ date: '2026-10-30', registrationLimit: null })
  await signIn(page, event.email)
  await page.goto(`/events/${event.eventId}`)
  const registrationPageButton = page.getByRole('link', { name: 'Go to registration page', exact: true })
  await expect(registrationPageButton).toHaveAttribute('href', `/attendances/events/${event.eventId}`)
  await registrationPageButton.click()
  await expect(page).toHaveURL(new RegExp(`/attendances/events/${event.eventId}$`))
  await expect(page.getByRole('heading', { name: event.eventName, exact: true })).toBeVisible()

  await page.goto(`/attendances/events/${event.eventId}`)
  await expect(page.getByRole('link', { name: 'Back to event request' })).toHaveAttribute('href', `/requests/${event.id}`)
  const requestButton = page.getByRole('link', { name: 'View event request' })
  await expect(requestButton).toHaveAttribute('href', `/requests/${event.id}`)
  await requestButton.click()
  await expect(page.getByRole('heading', { name: event.eventName, exact: true })).toBeVisible()
  await expect(page.getByText(`Request ID: ${event.id}`, { exact: false })).toBeVisible()

  await page.goto(`/attendances/events/${event.eventId}`)
  await page.getByRole('link', { name: 'Manage registrations' }).click()
  await expect(page.getByRole('heading', { name: 'Event registrations' })).toBeVisible()
  await page.getByRole('spinbutton', { name: 'Registration limit' }).fill('2')
  await page.getByRole('button', { name: 'Save limit' }).click()
  await expect(page.getByText('Registration limit saved.', { exact: true })).toBeVisible({ timeout: 15_000 })

  await signIn(page, emails.attendee)
  await page.goto(`/attendances/events/${event.eventId}`)
  const capacity = page.getByRole('region', { name: 'Registration capacity' })
  await expect(capacity.getByText('2 attendees', { exact: true })).toBeVisible()
  await expect(capacity.getByText('2 places left', { exact: true })).toBeVisible()
  await expect(capacity.getByText('80 attendees', { exact: true })).toHaveCount(0)
})

test('TC-CS48-12 registration commits during broker outage and its durable action is delivered after recovery', async ({ attendance }) => {
  const event = await attendance.event({ date: '2026-10-30', registrationLimit: 1 })
  await openRegistration(event.eventId, event.id)
  const attendee = await attendance.actor(emails.attendee)
  serviceAction('rabbitmq', 'stop')
  try {
    const response = await mutation(attendee, 'POST', `/api/attendances/events/${event.eventId}/registrations`, {})
    expect(response.status()).toBe(201)
    await expect.poll(() => reviewDatabase('attendance', async db => db.query(
      'SELECT "deliveredAt" FROM attendance_outbox WHERE "aggregateId"=$1', [event.eventId],
    ).then(result => result.rows[0]?.deliveredAt ?? null))).toBeNull()
  }
  finally { serviceAction('rabbitmq', 'start') }
  await expect.poll(() => reviewDatabase('attendance', async db => db.query(
    'SELECT "deliveredAt" FROM attendance_outbox WHERE "aggregateId"=$1', [event.eventId],
  ).then(result => Boolean(result.rows[0]?.deliveredAt))), { timeout: 70_000 }).toBe(true)
})
