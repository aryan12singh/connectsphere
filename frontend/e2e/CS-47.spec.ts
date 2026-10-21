import { test, expect, emails } from './fixtures/attendance-fixtures'
import { signIn, created, validRequest, mutation } from './fixtures/helpers'

test('TC-CS47-01: Attendee sees confirmed event details on the attendee dashboard', async ({ attendance, page }, info) => {
  const event = await attendance.event()
  await signIn(page, emails.attendee); await page.goto('/attendee')
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) }).click()
  await expect(page).toHaveTitle(/Event details | ConnectSphere/)
  await expect(page.getByRole('heading', { name: event.eventName })).toBeVisible()
  await expect(page.getByText(`Event ${event.eventId}`)).toBeVisible()
  await expect(page.getByText('Registration window')).toBeVisible()
  await page.screenshot({ path: info.outputPath('TC-CS47-01-event-details.png'), fullPage: true })
})

test('TC-CS47-03: Event list opens correct detail page; registration availability truthful', async ({ attendance, page }, info) => {
  const event = await attendance.event({ registrationEnabled: true })
  await signIn(page, emails.attendee); await page.goto('/attendee')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) }).click()
  await expect(page.getByRole('heading', { name: event.eventName })).toBeVisible()
  await expect(page.getByText(/registration window/i)).toBeVisible()
  await expect(page.getByText(/register \(coming soon.*CS-48\)/i)).toBeVisible()
  await page.screenshot({ path: info.outputPath('TC-CS47-03-list-to-detail.png'), fullPage: true })
})

test('TC-CS47-04: Attendee detail excludes private/internal fields', async ({ attendance, page }) => {
  const event = await attendance.event()
  await signIn(page, emails.attendee); await page.goto(`/attendances/events/${event.eventId}`)
  const response = await page.evaluate(async (eventId) => {
    const res = await fetch(`/api/attendances/events/${encodeURIComponent(eventId)}`, { credentials: 'include' })
    return { status: res.status, body: await res.json() }
  }, event.eventId)
  expect(response.status).toBe(200)
  const { body } = response
  expect(body.internalNotes).toBeUndefined()
  expect(body.planningData).toBeUndefined()
  expect(body.equipmentPlanning).toBeUndefined()
  expect(body.safetyReviews).toBeUndefined()
  expect(body.safetyNotes).toBeUndefined()
  expect(body.historicalArrangements).toBeUndefined()
  expect(body.otherUserRegistrations).toBeUndefined()
  expect(body.venueBookings).toBeUndefined()
  expect(body.title).toBeDefined()
  expect(body.description).toBeDefined()
})

test('TC-CS47-05: Non-confirmed event is hidden from attendee list and detail returns 404', async ({ attendance, page }) => {
  const owner = await attendance.actor(emails.owner)
  const draft = await mutation(owner, 'POST', '/api/events', { ...validRequest(), saveAs: 'draft' })
  expect(draft.status()).toBe(201)
  const draftBody = await draft.json()
  await signIn(page, emails.attendee); await page.goto('/attendee')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${draftBody.eventId}`) })).toHaveCount(0)
  const detail = await attendance.checkDetail(draftBody.eventId, await attendance.actor(emails.attendee))
  expect(detail.status()).toBe(404)
})

test('TC-CS47-08: Cancelled event - registered attendee sees own record; unrelated attendee denied', async ({ attendance, page }) => {
  const event = await attendance.cancelledEvent()
  const own = await attendance.checkRegistration(event.eventId, await attendance.actor(emails.attendee))
  expect(own.status()).toBe(200)
  await signIn(page, emails.attendee); await page.goto(`/attendances/registrations/${event.eventId}`)
  await expect(page.getByText('Your registration')).toBeVisible()
  await expect(page.getByText('CANCELLED', { exact: true }).first()).toBeVisible()
  const unrelated = await attendance.checkRegistration(event.eventId, await attendance.actor(emails.otherAttendee))
  expect(unrelated.status()).toBe(404)
  await signIn(page, emails.otherAttendee); await page.goto(`/attendances/registrations/${event.eventId}`)
  await expect(page.getByText('Registration not found', { exact: true })).toBeVisible()
})

test('TC-CS47-09: Responsive empty state on attendee dashboard', async ({ attendance, page }, info) => {
  await signIn(page, emails.attendee); await page.goto('/attendee')
  await expect(page.getByText(/no events/i)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText(/no events/i)).toBeVisible()
  await page.screenshot({ path: info.outputPath('TC-CS47-09-empty-mobile.png'), fullPage: true })
})

// These cases deliberately remain in the suite as executable specifications.  They
// are skipped until the named dependency delivers the real projection/workflow;
// a fixture must not manufacture a success path that production cannot provide.
test('TC-CS47-02: Multi-venue location presentation [stub]', async () => {
  test.skip(true, 'Stub: the attendee multi-venue/primary-venue projection and organiser venue detail are not delivered.')
})

test('TC-CS47-06: Effective replacement venue projection [stub]', async () => {
  test.skip(true, 'Stub: the effective replacement-venue projection is not delivered.')
})

test('TC-CS47-07: Visibility switches at confirmation [stub]', async () => {
  test.skip(true, 'Stub: CS-31 does not expose the real confirmation transition required by this boundary test.')
})


