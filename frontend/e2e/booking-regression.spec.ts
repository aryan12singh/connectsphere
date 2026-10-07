import { expect } from '@playwright/test'
import { test, signIn, session, mutation, emails, recreateBookingService } from './helpers'

test('Booking regression: staff can create operational windows in the UI but decision permission cannot create an ordinary booking', async ({ page, playwright }) => {
  await signIn(page, emails.staff)
  const staff = await session(playwright.request, emails.staff)
  try {
    await page.goto('/venue')
    await expect(page.getByRole('heading', { name: 'Manage venues', exact: true })).toBeVisible()
    let saved: any
    for (const [index, status] of ['BLOCKED', 'UNAVAILABLE'].entries()) {
      await page.getByRole('button', { name: 'New unavailable window', exact: true }).click()
      const statuses = page.getByRole('combobox', { name: 'Venue status', exact: true })
      await expect(statuses).toBeVisible()
      await expect(statuses.locator('option')).toHaveCount(2)
      expect(await statuses.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['BLOCKED', 'UNAVAILABLE'])
      await statuses.selectOption(status)
      await page.getByLabel('Title', { exact: true }).fill(`Live ${status} maintenance`)
      await page.getByLabel('Reason', { exact: true }).fill('Scheduled maintenance; customer bookings remain protected')
      await page.getByLabel('Start date and time', { exact: true }).fill(`2028-12-22T${index + 9 < 10 ? '0' : ''}${index + 9}:00`)
      await page.getByLabel('End date and time', { exact: true }).fill(`2028-12-22T${index + 10}:00`)
      const result = page.waitForResponse(response => response.url().endsWith('/api/bookings') && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Save booking', exact: true }).click()
      const response = await result
      // The existing booking BFF returns200; direct booking-service creation is201.
      expect(response.status()).toBe(200)
      saved = await response.json()
      expect(saved.status).toBe(status)
      expect(saved.eventId).toBeNull()
      await expect(page.getByRole('button', { name: 'Save booking', exact: true })).toHaveCount(0)
      expect((await staff.get(`/api/bookings/${saved.id}`)).status()).toBe(200)
    }
    const historyPath = `/api/bookings/history?venueId=${saved.venueId}`
    const prior = await (await staff.get(historyPath)).json()
    const denied = await mutation(staff, 'POST', '/api/bookings', { ...saved, status: 'CONFIRMED' })
    expect(denied.status()).toBe(403)
    expect(await denied.json()).not.toHaveProperty('id')
    expect((await (await staff.get(historyPath)).json()).items).toEqual(prior.items)
    // Recreate the app container, preserving its database and the live session.
    // Kong must resolve the current upstream and return the same persisted data.
    recreateBookingService()
    await expect.poll(async () => (await staff.get(`/api/bookings/${saved.id}`)).status(), { timeout: 45_000 }).toBe(200)
    expect(await (await staff.get(`/api/bookings/${saved.id}`)).json()).toEqual(saved)
    expect((await (await staff.get(historyPath)).json()).items).toEqual(prior.items)
  }
  finally { await staff.dispose() }
})
