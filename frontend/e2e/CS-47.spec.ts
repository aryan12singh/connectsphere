import { test, expect, emails } from './fixtures/attendance-fixtures'
import { signIn } from './fixtures/helpers'
import { planningEvent, createVenue, hold } from './fixtures/venue-fixtures'
import { safeConfirm, approve } from './fixtures/sprint4-fixtures'

test('TC-CS47-03: Event list opens correct detail page; registration availability truthful', async ({ attendance, page }, info) => {
  const event = await attendance.event({ registrationEnabled: true })
  await signIn(page, emails.attendee); await page.goto('/attendances')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) }).click()
  await expect(page.getByRole('heading', { name: event.eventName })).toBeVisible()
  await expect(page.getByText(/registration window/i)).toBeVisible()
  await expect(page.getByText(/registration opens/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('TC-CS47-03-list-to-detail.png'), fullPage: true })
})

test('TC-CS47-07: attendee visibility changes only after actual Safety and Event confirmation', async ({ attendance, page, playwright }, info) => {
  const owner = await attendance.actor(emails.owner)
  const staff = await attendance.actor(emails.staff)
  const officer = await attendance.actor(emails.officer)
  const planning = await planningEvent(playwright.request, owner, { equipmentNeeds: ['No equipment required'] })
  try {
    const venue = await createVenue(staff)
    const room = await approve(staff, await hold(planning.coordinator, planning.event.eventId, venue.id))
    await signIn(page, emails.attendee)
    const attendeeDetailStatus = () => page.evaluate(async (eventId) => {
      const response = await fetch(`/api/attendances/events/${encodeURIComponent(eventId)}`, { credentials: 'same-origin' })
      return response.status
    }, planning.event.eventId)
    expect(await attendeeDetailStatus()).toBe(404)
    await safeConfirm(planning.coordinator, officer, planning.event.eventId, planning.event.id)
    expect(await attendeeDetailStatus()).toBe(200)
    await page.goto(`/attendances/events/${planning.event.eventId}`)
    await expect(page.getByRole('heading', { name: planning.event.eventName })).toBeVisible()
    await page.locator('main').screenshot({ path: info.outputPath('TC-CS47-07-current-confirmation-boundary.png') })
    expect(room).toBeDefined()
  }
  finally { await planning.coordinator.dispose() }
})

test('TC-CS47-09: responsive empty state is clear on desktop and mobile', async ({ attendance, page }, info) => {
  let eventsListMockHit = false
  await page.route('**/api/attendances/events*', async (route) => {
    eventsListMockHit = true
    await route.fulfill({ json: { events: [] } })
  })
  await signIn(page, emails.attendee)
  await expect(page).toHaveURL(/\/attendances$/)
  await expect.poll(() => eventsListMockHit).toBe(true)
  await expect(page.getByText('No events yet', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('TC-CS47-09-empty-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('No events yet', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('TC-CS47-09-empty-mobile.png'), fullPage: true })
})
