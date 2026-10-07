import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test, session, mutation, signIn, emails } from './helpers'

test('TC-CS34-10 LIVE early Monday block renders in week/day; Technical Support calendar stays read-only', async ({ page, playwright }) => {
  const staff = await session(playwright.request, emails.staff)
  const title = `Early Monday ${randomUUID()}`
  let name = ''
  try {
    name = `Calendar ${randomUUID()}`
    const created = await mutation(staff, 'POST', '/api/venues', { name, address: 'Synthetic calendar venue', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: [], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'a1000000-0000-4000-8000-000000000008', reason: 'Local date verification', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '00:00', closesAt: '23:59' }] }); expect(created.status()).toBe(200)
    const venue = await created.json()
    const block = await mutation(staff, 'POST', '/api/bookings', { venueId: venue.id, title, reason: 'Local date verification', startAt: '2026-12-20T16:30:00Z', endAt: '2026-12-20T17:30:00Z', timeZone: 'Asia/Singapore', status: 'BLOCKED' }); expect(block.status()).toBe(200)
  } finally { await staff.dispose() }
  await page.clock.setFixedTime(new Date('2026-12-21T00:00:00Z'))
  await signIn(page, emails.support)
  await page.goto('/venue')
  await page.getByPlaceholder('Search venues...').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button').filter({ hasText: title })).toBeVisible()
  await page.getByRole('combobox', { name: 'Calendar view' }).selectOption('day')
  await expect(page.getByRole('button').filter({ hasText: title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New booking', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit venue' })).toHaveCount(0)
})


test('TC-CS34-13 LIVE SSR calendar and workspace controls stay inert until handlers attach', async ({ page, browser }) => {
  await signIn(page, emails.staff)
  const beforeHydration = await browser.newContext({ baseURL: new URL(page.url()).origin, storageState: await page.context().storageState(), viewport: page.viewportSize() ?? undefined, javaScriptEnabled: false })
  try {
    const ssr = await beforeHydration.newPage()
    await ssr.goto('/venue')
    await expect(ssr.getByPlaceholder('Search venues...')).toBeDisabled()
    await expect(ssr.getByRole('button', { name: 'Booking requests', exact: true })).toBeDisabled()
    await expect(ssr.getByRole('combobox', { name: 'Calendar view' })).toBeDisabled()
    await expect(ssr.getByRole('button', { name: 'New unavailable window', exact: true })).toBeDisabled()
    await expect(ssr.getByRole('button', { name: 'Next range', exact: true })).toBeDisabled()
  } finally { await beforeHydration.close() }
})
