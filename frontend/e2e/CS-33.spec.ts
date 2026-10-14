import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test, field, signIn, session, mutation, emails } from './helpers'
import { createVenue, databaseEvidence, reviewDatabase } from './venue-fixtures'

test('TC-CS33-12 TC-CS33-13 TC-CS33-16 LIVE invalid venue time zones show field guidance and preserve the record/history with an unobstructed retry', async ({ page, playwright }, info) => {
  const staff = await session(playwright.request, emails.staff)
  try {
    const venue = await createVenue(staff)
    const historyResponse = await staff.get(`/api/venues/${venue.id}/history/combined`)
    expect(historyResponse.status()).toBe(200)
    const history = await historyResponse.json()
    const countQuery = 'SELECT count(*)::integer AS count FROM venue_history WHERE "venueId"=$1'
    const beforeHistory = (await reviewDatabase<{ rows: Array<{ count: number }> }>('venue', db => db.query(countQuery, [venue.id]))).rows[0]!.count
    expect((await mutation(staff, 'POST', '/api/venues', { ...venue, name: `Invalid zone ${randomUUID()}`, timeZone: 'Asia/Singapor', reason: 'Invalid create must fail' })).status()).toBe(422)
    await signIn(page, emails.staff)
    await page.goto(`/venue/${venue.id}`)
    await field(page, 'Time zone').fill('Asia/Singapor')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await field(page, 'Reason or note').fill('Invalid timezone review')
    const invalidSave = page.waitForResponse(response => response.url().endsWith(`/api/venues/${venue.id}`) && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    expect((await invalidSave).status()).toBe(422)
    await expect(page.locator('#venue-time-zone-error')).toHaveText('Use a valid time zone, such as Asia/Singapore')
    await expect(field(page, 'Time zone')).toHaveAttribute('aria-invalid', 'true')
    await expect(field(page, 'Time zone')).toHaveValue('Asia/Singapor')
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    expect(await (await staff.get(`/api/venues/${venue.id}`)).json()).toEqual(venue)
    const afterFailureHistory = await staff.get(`/api/venues/${venue.id}/history/combined`)
    expect(afterFailureHistory.status()).toBe(200)
    expect(await afterFailureHistory.json()).toEqual(history)
    await page.screenshot({ path: info.outputPath('TC-CS33-13-time-zone-guidance.png'), fullPage: true })
    await field(page, 'Time zone').fill('Asia/Singapore')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    const validSave = page.waitForResponse(response => response.url().endsWith(`/api/venues/${venue.id}`) && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const savedResponse = await validSave
    expect(savedResponse.status(), await savedResponse.text()).toBe(200)
    await expect(page).toHaveURL(/\/venue$/)
    const query = 'SELECT v.id,v."timeZone",v.version,count(h.id)::integer AS "historyCount" FROM venues v LEFT JOIN venue_history h ON h."venueId"=v.id WHERE v.id=$1 GROUP BY v.id'
    const rows = (await reviewDatabase<{ rows: Array<{ timeZone: string, version: number, historyCount: number }> }>('venue', db => db.query(query, [venue.id]))).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ timeZone: 'Asia/Singapore', version: venue.version + 1, historyCount: beforeHistory + 1 })
    await databaseEvidence(page, info, 'TC-CS33-12', [{ database: 'venue_db', query, rows }])
    await page.goto('/venue/new')
    const name = `Timezone form ${randomUUID()}`
    await field(page, 'Venue name').fill(name)
    await field(page, 'Venue address').fill('Synthetic venue')
    await field(page, 'Venue capacity').fill('100')
    await field(page, 'Time zone').fill('Asia/Singapor')
    await page.getByRole('button', { name: 'Create venue', exact: true }).click()
    await field(page, 'Reason or note').fill('Create timezone verification')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.locator('#venue-time-zone-error')).toHaveText('Use a valid time zone, such as Asia/Singapore')
    await expect(field(page, 'Venue name')).toHaveValue(name)
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await field(page, 'Time zone').fill('Asia/Singapore')
    await page.getByRole('button', { name: 'Create venue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Edit venue', exact: true })).toBeVisible()
  } finally { await staff.dispose() }
})

test('TC-CS33-14 TC-CS33-15 LIVE venue paging and full audit history controls change the displayed records', async ({ page, playwright }, info) => {
  const staff = await session(playwright.request, emails.staff)
  try {
    const prefix = `Paging ${randomUUID()}`
    const venues = []
    for (let n = 1; n <= 14; n++) venues.push(await createVenue(staff, { name: `${prefix} ${String(n).padStart(2, '0')}` }))
    let venue = venues[0]!
    for (let n = 1; n <= 4; n++) {
      const result = await mutation(staff, 'PUT', `/api/venues/${venue.id}`, { ...venue, reason: `History walkthrough ${n}` })
      expect(result.status()).toBe(200)
      venue = await result.json()
    }
    await signIn(page, emails.staff)
    await page.goto('/venue')
    const sidebar = page.locator('aside')
    await sidebar.getByPlaceholder('Search venues...').fill(prefix)
    const cards = sidebar.getByRole('button').filter({ hasText: prefix })
    await expect(cards).toHaveCount(6)
    const pages = sidebar.getByRole('navigation', { name: 'Venue pages' })
    await expect(pages).toContainText('Page 1 of 3')
    await expect(pages.getByRole('button', { name: /Previous/ })).toBeDisabled()
    await pages.getByRole('button', { name: /Next/ }).click()
    await expect(pages).toContainText('Page 2 of 3')
    await expect(cards).toHaveCount(6)
    await pages.getByRole('button', { name: /Next/ }).click()
    await expect(cards).toHaveCount(2)
    await expect(pages.getByRole('button', { name: /Next/ })).toBeDisabled()
    await sidebar.getByPlaceholder('Search venues...').fill(venue.name)
    await expect(cards).toHaveCount(1)
    await cards.first().click()
    const history = page.locator(`#venue-history-${venue.id}`)
    await expect(history.locator('li')).toHaveCount(3)
    await page.getByRole('button', { name: 'Show full history', exact: true }).click()
    await expect(history.locator('li')).toHaveCount(5)
    await page.screenshot({ path: info.outputPath('TC-CS33-15-full-history.png'), fullPage: true })
    await page.getByRole('button', { name: 'Show recent history', exact: true }).click()
    await expect(history.locator('li')).toHaveCount(3)
    await sidebar.getByPlaceholder('Search venues...').fill(`No match ${randomUUID()}`)
    await expect(sidebar).toContainText('No venues match your search.')
    await expect(pages).toHaveCount(0)
  } finally { await staff.dispose() }
})

test('TC-CS33-09 LIVE reversed/equal hours cannot create or edit a venue or its history', async ({ playwright }) => {
  const staff = await session(playwright.request, emails.staff)
  try {
    const values = { name: `Hours ${randomUUID()}`, address: 'Synthetic venue', capacity: 100, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: [], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'a1000000-0000-4000-8000-000000000008', reason: 'Live hours verification', operatingHours: [{ weekday: 'MONDAY', isClosed: false, opensAt: '09:00', closesAt: '17:00' }] }
    const created = await mutation(staff, 'POST', '/api/venues', values); expect(created.status()).toBe(200)
    const venue = await created.json(); const history = await (await staff.get(`/api/venues/${venue.id}/history`)).json()
    for (const closesAt of ['08:00', '09:00']) {
      const operatingHours = [{ ...values.operatingHours[0], closesAt }]
      for (const [path, data] of [[`/api/venues/${venue.id}`, { ...values, operatingHours }], [`/api/venues/${venue.id}/operating-hours`, { items: operatingHours, reason: 'Invalid edit' }]] as const) expect((await mutation(staff, 'PUT', path, data)).status()).toBe(422)
      expect((await mutation(staff, 'POST', '/api/venues', { ...values, operatingHours })).status()).toBe(422)
    }
    expect(await (await staff.get(`/api/venues/${venue.id}`)).json()).toEqual(venue)
    expect(await (await staff.get(`/api/venues/${venue.id}/history`)).json()).toEqual(history)
  } finally { await staff.dispose() }
})


test('TC-CS33-11 LIVE SSR venue form stays inert until handlers attach', async ({ page, browser }) => {
  await signIn(page, emails.staff)
  const beforeHydration = await browser.newContext({ baseURL: new URL(page.url()).origin, storageState: await page.context().storageState(), viewport: page.viewportSize() ?? undefined, javaScriptEnabled: false })
  try {
    const ssr = await beforeHydration.newPage()
    await ssr.goto('/venue/new')
    await expect(ssr.getByRole('heading', { name: 'New venue', exact: true })).toBeVisible()
    await expect(field(ssr, 'Venue name')).toBeDisabled()
    await expect(field(ssr, 'Opening time')).toBeDisabled()
    await expect(ssr.getByRole('button', { name: 'Create venue', exact: true })).toBeDisabled()
  } finally { await beforeHydration.close() }
})
