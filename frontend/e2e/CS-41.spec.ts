import { randomUUID } from 'node:crypto'
import { test, expect, emails, availabilityPath, snapshot, internal, mutation, reviewDatabase, serviceAction } from './equipment-fixtures'
import { signIn } from './helpers'
import { createVenue, hold } from './venue-fixtures'

test('TC-CS41-01: every line reports requested, available and shortfall with whole-request fulfilment', async ({ equipment }) => {
  await equipment.stock('projector', 5); await equipment.stock('speaker', 4)
  const event = await equipment.event(); const competing = await equipment.event({ date: event.date })
  await equipment.submit(competing, [{ equipmentType: 'projector', quantity: 3 }]); await equipment.approve(competing)
  expect((await equipment.reserve(competing)).status()).toBe(200)
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 3 }, { equipmentType: 'speaker', quantity: 1 }])
  const check = await equipment.check(event)
  expect(check.fulfillable).toBe(false)
  expect(check.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ equipmentType: 'projector', requested: 3, available: 2, shortfall: 1 }),
    expect.objectContaining({ equipmentType: 'speaker', requested: 1, available: 4, shortfall: 0 }),
  ]))
})

test('TC-CS41-02: exact stock, one short and zero stock retain bounded availability', async ({ equipment }) => {
  await equipment.stock('projector', 5)
  const event = await equipment.event(); await equipment.submit(event, [{ equipmentType: 'projector', quantity: 5 }])
  expect((await equipment.check(event)).lines[0]).toMatchObject({ available: 5, shortfall: 0 })
  expect((await equipment.operation(event)).status()).toBe(200)
  expect((await equipment.check(event)).lines[0]).toMatchObject({ available: 4, shortfall: 1 })
  await equipment.stock('projector', 0)
  expect((await equipment.check(event)).lines[0]).toMatchObject({ available: 0, shortfall: 5 })
  await equipment.stock('projector', 5)
})

test('TC-CS41-03: touching occupied windows consume no stock but a one-minute overlap does', async ({ equipment }) => {
  const first = await equipment.event(); await equipment.submit(first, [{ equipmentType: 'projector', quantity: 5 }]); await equipment.approve(first)
  expect((await equipment.reserve(first)).status()).toBe(200)
  const adjacent = await equipment.event({ date: first.date, startAt: `${first.date}T05:15:00.000Z`, endAt: `${first.date}T06:00:00.000Z` })
  await equipment.submit(adjacent, [{ equipmentType: 'projector', quantity: 1 }])
  expect((await equipment.check(adjacent)).lines[0].available).toBe(5)
  const overlapping = await equipment.event({ date: first.date, startAt: `${first.date}T05:14:00.000Z`, endAt: `${first.date}T06:00:00.000Z` })
  await equipment.submit(overlapping, [{ equipmentType: 'projector', quantity: 1 }])
  expect((await equipment.check(overlapping)).lines[0].available).toBe(0)
})

test('TC-CS41-04: stock five minus two reserved and one operationally unavailable leaves two', async ({ equipment }) => {
  const event = await equipment.event(); const competing = await equipment.event({ date: event.date })
  await equipment.submit(competing); await equipment.approve(competing); expect((await equipment.reserve(competing)).status()).toBe(200)
  expect((await equipment.operation(event)).status()).toBe(200)
  await equipment.submit(event)
  expect((await equipment.check(event)).lines[0].available).toBe(2)
  const free = await equipment.event({ date: event.date, startAt: `${event.date}T07:00:00.000Z`, endAt: `${event.date}T08:00:00.000Z` }); await equipment.submit(free)
  expect((await equipment.check(free)).lines[0].available).toBe(5)
})

test('TC-CS41-05: repeat availability checks return live timestamps without snapshots, reservations or outbox writes', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); const before = await snapshot(event)
  const first = await equipment.check(event); const second = await equipment.check(event)
  expect(Number.isFinite(Date.parse(first.checkedAt))).toBe(true)
  expect(Date.parse(second.checkedAt)).toBeGreaterThanOrEqual(Date.parse(first.checkedAt))
  expect(await snapshot(event)).toEqual(before)
  expect(await reviewDatabase('equipment', async pool => (await pool.query("SELECT to_regclass('public.equipment_availability_checks') AS table_name")).rows[0].table_name)).toBeNull()
})

test('TC-CS41-06: another Event reservation makes an earlier sufficient dated check stale', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event, [{ equipmentType: 'projector', quantity: 4 }])
  const first = await equipment.check(event); expect(first.fulfillable).toBe(true)
  const competing = await equipment.event({ date: event.date }); await equipment.submit(competing); await equipment.approve(competing)
  expect((await equipment.reserve(competing)).status()).toBe(200)
  const next = await equipment.check(event); expect(next.fulfillable).toBe(false); expect(next.lines[0].shortfall).toBe(1)
  expect(next.lines[0].shortfall).toBe(1)
})

test('TC-CS41-07: two venue allocations count the Event quantity exactly once', async ({ equipment }) => {
  const event = await equipment.event({ rooms: 2 }); await equipment.submit(event)
  const check = await equipment.check(event)
  expect(check.lines).toHaveLength(1); expect(check.lines[0]).toMatchObject({ requested: 2, available: 5, shortfall: 0 })
})

test('TC-CS41-08: only Support may check supply or change operations; denied calls preserve state', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); const before = await snapshot(event)
  for (const actor of [event.coordinator, await equipment.actor(emails.owner), await equipment.actor(emails.attendee)]) {
    expect((await actor.get(availabilityPath(event))).status()).toBe(403)
    expect((await mutation(actor, 'POST', '/api/equipment/operations', { equipmentType: 'projector', quantity: 1, reason: 'Denied', ...event.period })).status()).toBe(403)
  }
  expect(await snapshot(event)).toEqual(before)
  expect((await equipment.check(event)).fulfillable).toBe(true)
})

test('TC-CS41-09: overlapping operational unavailability retains reservations and invalidates current proof', async ({ equipment }) => {
  const event = await equipment.event(); await equipment.submit(event); await equipment.approve(event); expect((await equipment.reserve(event)).status()).toBe(200)
  const before = await snapshot(event)
  expect((await internal('equipment', `/internal/events/${event.eventId}/readiness`)).body.status).toBe('APPROVED')
  expect((await equipment.operation(event, 4)).status()).toBe(200)
  const proof = await internal('equipment', `/internal/events/${event.eventId}/readiness`)
  expect(proof.body.status).toBe('PENDING'); expect(proof.body.reason).toBe('EQUIPMENT_OPERATION_CHANGED')
  const after = await snapshot(event)
  expect(after.reservations).toEqual(before.reservations); expect(after.history).toEqual(before.history)
})

test('TC-CS41-10: invalid operations write nothing and exact command retries create one operation', async ({ equipment }) => {
  const event = await equipment.event(); const key = randomUUID()
  for (const patch of [{ quantity: 0 }, { equipmentType: 'unknown' }, { reason: ' ' }, { endAt: event.period.startAt }]) expect((await equipment.operation(event, 1, patch)).status()).toBe(422)
  const before = await reviewDatabase('equipment', async pool => (await pool.query('SELECT id FROM equipment_operational_unavailability WHERE "startAt"=$1', [event.period.startAt])).rows)
  expect(before).toEqual([])
  expect((await equipment.operation(event, 1, {}, key)).status()).toBe(200)
  const retries = await Promise.all([equipment.operation(event, 1, {}, key), equipment.operation(event, 1, {}, key)])
  expect(retries.map(response => response.status())).toEqual([200, 200])
  const rows = await reviewDatabase('equipment', async pool => (await pool.query('SELECT id FROM equipment_operational_unavailability WHERE "startAt"=$1', [event.period.startAt])).rows)
  expect(rows).toHaveLength(1)
  expect((await equipment.operation(event, 2, {}, key)).status()).toBe(409)
})

test('TC-CS41-11a: staff review detail no longer shows venue allocation portion', async ({ equipment, page }) => {
  await equipment.stock('projector', 5)
  const event = await equipment.event({ rooms: 2 })
  const staff = await equipment.actor(emails.staff)
  const venue = await createVenue(staff)
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 2, venueId: venue.id }])
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  const requestCard = page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) })
  await requestCard.click()
  await expect(page.getByText('Venue allocation', { exact: true })).toHaveCount(0)
})

test('TC-CS41-11b: equipment availability table shows venue column with venue name', async ({ equipment, page }) => {
  await equipment.stock('projector', 5)
  const event = await equipment.event({ rooms: 2 })
  const staff = await equipment.actor(emails.staff)
  const venue = await createVenue(staff)
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 3, venueId: venue.id }])
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  const requestCard = page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) })
  await requestCard.click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveText(['Equipment', 'Requested', 'Available', 'Shortfall', 'Result', 'Venue'])
  await expect(page.getByRole('cell', { name: venue.name })).toBeVisible()
})

test('TC-CS41-11c: venue column also shows when request is reserved', async ({ equipment, page }) => {
  await equipment.stock('projector', 5)
  const event = await equipment.event({ rooms: 2 })
  const staff = await equipment.actor(emails.staff)
  const venue = await createVenue(staff)
  await equipment.submit(event, [{ equipmentType: 'projector', quantity: 2, venueId: venue.id }])
  await equipment.approve(event)
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  const requestCard = page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) })
  await requestCard.click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveText(['Equipment', 'Requested', 'Available', 'Shortfall', 'Result', 'Venue'])
  await page.getByRole('button', { name: 'Reserve complete request', exact: true }).click()
  await expect(page.getByRole('columnheader')).toHaveText(['Equipment', 'Requested', 'Venue'])
  await expect(page.getByRole('cell', { name: venue.name })).toBeVisible()
})

test('TC-CS41-11: Support availability UI shows dated line results and survives refresh and service restart', async ({ equipment, page }, info) => {
  await equipment.stock('projector', 5)
  await equipment.stock('speaker', 5)
  const event = await equipment.event(); await equipment.submit(event)
  const secondEvent = await equipment.event({ date: event.date }); await equipment.submit(secondEvent, [{ equipmentType: 'speaker', quantity: 1 }])
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary' })
  const primaryLinks = primaryNavigation.getByRole('link')
  if (await page.evaluate(() => window.innerWidth >= 1024)) {
    await expect(primaryLinks).toHaveCount(2)
    await expect(primaryLinks.nth(0)).toHaveAccessibleName('Technical Review')
    await expect(primaryLinks.nth(1)).toHaveAccessibleName('Venues')
  }
  const tabList = page.getByRole('tablist', { name: 'Technical availability views' })
  if (await page.evaluate(() => window.innerWidth >= 1024)) {
    const [tabsBox, tabsParentBox] = await Promise.all([tabList.boundingBox(), page.locator('[data-slot="tabs"]').boundingBox()])
    expect(tabsBox).not.toBeNull()
    expect(tabsParentBox).not.toBeNull()
    expect(tabsBox!.width).toBeLessThan(tabsParentBox!.width)
  }
  const support = await equipment.actor(emails.support)
  const queue = await (await support.get('/api/technical-requests?includeResolved=1')).json()
  const queuedEvent = queue.requests.find((request: any) => request.eventRequestId === event.id)
  const formatPeriod = (startAt: string, endAt: string) => {
    const format = (value: string) => new Intl.DateTimeFormat('en-SG', { timeZone: queuedEvent.event.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    return `${format(startAt)} – ${format(endAt)}`
  }
  const requestCard = page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) })
  await requestCard.click()
  await expect(requestCard).toContainText(formatPeriod(queuedEvent.event.startAt, queuedEvent.event.endAt))
  await expect(page.getByText('Submitted by', { exact: true })).toBeVisible()
  await expect(page.getByText('Equipment period', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Event period', { exact: true })).toBeVisible()
  await expect(page.getByText(/submitted at/i)).toHaveCount(0)
  const availabilityTable = page.getByRole('table', { name: 'Equipment availability' })
  const decisionCard = page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: 'Decision', exact: true }) })
  await expect(decisionCard).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Availability for the event period' })).toHaveCount(0)
  await expect(availabilityTable).toContainText('Projector')
  await expect(availabilityTable).toContainText('2')
  await expect(page.getByRole('columnheader')).toHaveText(['Equipment', 'Requested', 'Available', 'Shortfall', 'Result', 'Venue'])
  await expect(page.locator('time')).toBeVisible()
  await expect(decisionCard.getByText(/Equipment period includes venue setup and turnaround buffers/)).toHaveCount(0)
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'Available' })).toBeVisible()
  await expect(page.getByText('All requested equipment is available.', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Re-check', exact: true })).toBeEnabled()
  const secondRequestCard = page.getByRole('button', { name: new RegExp(`Event request ${secondEvent.id}`) })
  await secondRequestCard.click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toContainText('Speaker')
  await expect(page.getByRole('button', { name: 'Re-check', exact: true })).toBeEnabled()
  const failedAvailabilityRoute = `**/api/equipment/requests/${secondEvent.id}/availability`
  await page.route(failedAvailabilityRoute, async route => {
    await new Promise(resolve => setTimeout(resolve, 350))
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusMessage: 'Availability service unavailable for this test.' }) })
  })
  const failedAvailabilityResponse = page.waitForResponse(response => response.url().includes(`/api/equipment/requests/${secondEvent.id}/availability`) && response.status() === 503)
  await page.getByRole('button', { name: 'Re-check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Checking…', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toHaveCount(0)
  await failedAvailabilityResponse
  await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute(failedAvailabilityRoute)
  await page.getByRole('button', { name: 'Check availability', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toContainText('Speaker')
  await expect(page.getByRole('button', { name: 'Re-check', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }).click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toContainText('Projector')
  await page.getByRole('tab', { name: 'Manage equipment stock' }).click()
  await page.getByLabel('Quantity', { exact: false }).fill('4')
  await page.getByRole('combobox', { name: 'Reason' }).click()
  await page.getByRole('option', { name: 'Repair', exact: true }).click()
  const reasonControlBox = await page.getByRole('combobox', { name: 'Reason' }).boundingBox()
  const saveButtonBox = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox()
  expect(reasonControlBox).not.toBeNull()
  expect(saveButtonBox).not.toBeNull()
  expect(saveButtonBox!.y - (reasonControlBox!.y + reasonControlBox!.height)).toBeGreaterThanOrEqual(12)
  expect(saveButtonBox!.y - (reasonControlBox!.y + reasonControlBox!.height)).toBeLessThanOrEqual(20)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Operational unavailability recorded.')
  await page.getByRole('tab', { name: 'Review technical requests' }).click()
  await expect(page.getByRole('alert')).toContainText('Not fulfillable')
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'Short by 1' })).toBeVisible()
  await page.getByRole('radio', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Submit decision', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reserve complete request', exact: true })).toBeEnabled()
  const reserveButton = page.getByRole('button', { name: 'Reserve complete request', exact: true })
  await expect(reserveButton).toBeEnabled()
  const reserveResponse = page.waitForResponse(response => response.url().includes(`/api/equipment/requests/${event.id}/reserve`) && response.request().method() === 'POST')
  await reserveButton.click()
  expect((await reserveResponse).status()).toBe(409)
  await expect(page.getByRole('alert').filter({ hasText: '[POST]' })).toBeVisible()
  await page.getByRole('tab', { name: 'Manage equipment stock' }).click()
  await page.getByLabel('Quantity', { exact: false }).fill('6')
  await page.getByRole('combobox', { name: 'Reason' }).click()
  await page.getByRole('option', { name: 'Fault', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }).click()
  await expect(page.getByRole('table', { name: 'Equipment availability' })).toContainText('Projector')
  serviceAction('equipment-service', 'restart')
  await expect.poll(async () => (await (await equipment.actor(emails.support)).get(availabilityPath(event))).status(), { timeout: 45_000 }).toBe(200)
  expect((await equipment.check(event)).lines[0]).toMatchObject({ requested: 2, shortfall: 1 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Review technical requests' }).click()
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasHorizontalOverflow).toBe(false)
  await page.screenshot({ path: info.outputPath('TC-CS41-11-availability-mobile.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Manage equipment stock' }).click()
  await expect(page.getByRole('heading', { name: 'Mark stock unavailable' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: info.outputPath('TC-CS41-11-stock-mobile.png'), fullPage: true })
})

test('TC-CS41-15: technical request queue and detail columns scroll independently on desktop', async ({ equipment, page }, info) => {
  const longEventName = 'T'.repeat(80)
  for (let index = 0; index < 4; index++) {
    const event = await equipment.event()
    await equipment.submit(event)
  }
  const longTitleEvent = await equipment.event({ eventName: longEventName })
  await equipment.submit(longTitleEvent)
  await signIn(page, emails.support); await page.setViewportSize({ width: 1512, height: 720 }); await page.goto('/technical-requirements')
  const queue = page.getByRole('navigation', { name: 'Technical requests' })
  const detail = page.getByRole('region', { name: 'Selected technical request' })
  await expect(queue).toBeVisible()
  await expect(detail).toBeVisible()
  const longTitle = detail.getByRole('heading', { name: longEventName })
  await expect(longTitle).toBeVisible()
  expect(await longTitle.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await longTitle.evaluate(element => element.clientWidth))
  await queue.getByRole('button').filter({ hasText: /^E2E / }).first().click()
  const regularTitle = detail.locator('h2').first()
  await expect(regularTitle).toBeVisible()
  await expect(detail.locator('time')).toBeVisible()
  const headingToDataGap = await detail.locator('[data-slot="card"]').first().evaluate(card => {
    const headingGroup = card.firstElementChild!
    const firstDatum = card.querySelector('dl > div')!
    return firstDatum.getBoundingClientRect().top - headingGroup.getBoundingClientRect().bottom
  })
  expect(headingToDataGap).toBeLessThanOrEqual(24)
  const [decisionCard, typography] = await Promise.all([
    detail.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: 'Decision', exact: true }) }),
    page.evaluate(() => {
      const radioLegend = document.querySelector('[data-slot="field-legend"]')!
      const reasonLabel = document.querySelector('label[for="decision-reason"]')!
      const detailCard = document.querySelector('[aria-label="Selected technical request"] [data-slot="card"]')!
      const decisionCard = [...document.querySelectorAll('[aria-label="Selected technical request"] [data-slot="card"]')].find(card => card.querySelector('h2')?.textContent === 'Decision')!
      const firstDatum = detailCard.querySelector('dl > div')!
      const decisionTime = decisionCard.querySelector('time')!
      const lastChecked = decisionTime.closest('p')!
      return {
        radioFontSize: getComputedStyle(radioLegend).fontSize,
        reasonFontSize: getComputedStyle(reasonLabel).fontSize,
        detailGap: firstDatum.getBoundingClientRect().top - detailCard.firstElementChild!.getBoundingClientRect().bottom,
        decisionGap: lastChecked.getBoundingClientRect().top - decisionCard.querySelector('h2')!.getBoundingClientRect().bottom,
      }
    }),
  ])
  await expect(decisionCard).toBeVisible()
  expect(typography.radioFontSize).toBe(typography.reasonFontSize)
  expect(Math.abs(typography.decisionGap - typography.detailGap)).toBeLessThanOrEqual(1)
  await queue.getByRole('button').filter({ hasText: longEventName }).click()
  await page.screenshot({ path: info.outputPath('TC-CS41-15-detail-column-width.png'), fullPage: false })
  const availableDetailWidth = await detail.evaluate(element => {
    const layout = element.parentElement!
    const queue = layout.querySelector('[aria-label="Technical requests"]')!
    return layout.clientWidth - queue.getBoundingClientRect().width - Number.parseFloat(getComputedStyle(layout).columnGap)
  })
  expect(await detail.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(availableDetailWidth - 2)
  const cardWidths = await detail.locator('[data-slot="card"]').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width))
  const detailClientWidth = await detail.evaluate(element => element.clientWidth)
  expect(cardWidths.every(width => width >= availableDetailWidth - 18 && width <= detailClientWidth + 1)).toBe(true)
  const rightEdgeClearance = await detail.evaluate(element => {
    const lastCard = element.querySelector('[data-slot="card"]')!
    return element.getBoundingClientRect().right - lastCard.getBoundingClientRect().right
  })
  expect(rightEdgeClearance).toBeGreaterThanOrEqual(8)
  const leftEdgeClearance = await detail.evaluate(element => {
    const firstCard = element.querySelector('[data-slot="card"]')!
    return firstCard.getBoundingClientRect().left - element.getBoundingClientRect().left
  })
  expect(leftEdgeClearance).toBeGreaterThanOrEqual(8)

  const dimensions = async (locator: typeof queue) => locator.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }))
  const queueBefore = await dimensions(queue)
  const detailBefore = await dimensions(detail)
  const windowScroll = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    return window.scrollY
  })
  expect(windowScroll).toBe(0)
  expect(queueBefore.overflowY).toBe('auto')
  expect(queueBefore.scrollHeight).toBeGreaterThan(queueBefore.clientHeight)
  expect(detailBefore.overflowY).toBe('auto')
  expect(detailBefore.scrollHeight).toBeGreaterThan(detailBefore.clientHeight)

  await queue.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => queue.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await detail.evaluate(element => element.scrollTop)).toBe(0)
  await detail.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await queue.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('TC-CS41-15-independent-columns.png'), fullPage: false })

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024)
  expect(await queue.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1024)
  expect(await detail.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1024)
  const availableAt1024 = await detail.evaluate(element => {
    const layout = element.parentElement!
    const queue = layout.querySelector('[aria-label="Technical requests"]')!
    return layout.clientWidth - queue.getBoundingClientRect().width - Number.parseFloat(getComputedStyle(layout).columnGap)
  })
  expect(await detail.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(availableAt1024 - 2)
  expect((await detail.locator('[data-slot="card"]').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width))).every(width => width >= availableAt1024 - 18)).toBe(true)
  const firstCardAt1024 = await detail.locator('[data-slot="card"]').first().evaluate(element => element.getBoundingClientRect())
  const detailBoundsAt1024 = await detail.evaluate(element => element.getBoundingClientRect())
  expect(firstCardAt1024.left - detailBoundsAt1024.left).toBeGreaterThanOrEqual(8)
  expect(detailBoundsAt1024.right - firstCardAt1024.right).toBeGreaterThanOrEqual(8)
  expect(await longTitle.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await longTitle.evaluate(element => element.clientWidth))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: info.outputPath('TC-CS41-15-mobile-stack.png'), fullPage: false })
})

test('TC-CS41-12: earliest setup and latest turnaround define the pooled period without a second buffer', async ({ equipment }) => {
  const event = await equipment.event(); const staff = await equipment.actor(emails.staff)
  const venue = await createVenue(staff)
  const second = await hold(event.coordinator, event.eventId, venue.id, { startAt: `${event.date}T05:00:00Z`, endAt: `${event.date}T06:00:00Z` })
  expect((await mutation(staff, 'PUT', `/api/bookings/${second.id}/decision`, { version: second.version, status: 'CONFIRMED', reason: 'Later allocation fixture' })).status()).toBe(200)
  await equipment.submit(event)
  expect((await equipment.check(event)).period).toEqual({ startAt: `${event.date}T01:30:00.000Z`, endAt: `${event.date}T06:45:00.000Z` })
})

test('TC-CS41-13: private allocation projection supplies current versions and excludes an expired hold', async ({ equipment }) => {
  const event = await equipment.event(); const staff = await equipment.actor(emails.staff)
  const venue = await createVenue(staff)
  const expired = await hold(event.coordinator, event.eventId, venue.id, { startAt: `${event.date}T06:00:00Z`, endAt: `${event.date}T07:00:00Z` })
  await reviewDatabase('booking', pool => pool.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp() WHERE id=$1', [expired.id]))
  const projection = await internal('booking', `/internal/events/${event.eventId}/equipment-allocation-context`)
  expect(projection.status).toBe(200)
  expect(projection.body.allocations).toHaveLength(1)
  expect(projection.body.allocations[0]).toMatchObject({ bookingId: event.rooms[0].id, bookingVersion: event.rooms[0].version, venueVersion: expect.any(Number) })
  expect(projection.body.allocations.some((row: any) => row.bookingId === expired.id)).toBe(false)
})

test('TC-CS41-14: stock is read-only in the stock tab and API inventory writes remain versioned', async ({ equipment, page }) => {
  await equipment.stock('projector', 5)
  const event = await equipment.event(); const support = await equipment.actor(emails.support)
  const before = (await (await support.get('/api/equipment/inventory')).json()).items.find((item: any) => item.equipmentType === 'projector')
  await signIn(page, emails.support); await page.goto('/technical-requirements')
  await page.getByRole('tab', { name: 'Manage equipment stock' }).click()
  await page.getByRole('combobox', { name: 'Equipment' }).click()
  await expect(page.getByRole('option').allTextContents()).resolves.toContain('Projector (stock 5)')
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: 'Reason' }).click()
  await expect(page.getByRole('option').allTextContents()).resolves.toEqual(['Repair', 'Fault', 'Lost', 'Other'])
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('projector total stock', { exact: true })).toHaveCount(0)
  const saved = await mutation(support, 'PUT', '/api/equipment/inventory/projector', { total: 6, version: before.version })
  expect(saved.status()).toBe(200)
  const after = (await (await support.get('/api/equipment/inventory')).json()).items.find((item: any) => item.equipmentType === 'projector')
  expect(after).toMatchObject({ total: 6, version: before.version + 1 })
  expect((await mutation(support, 'PUT', '/api/equipment/inventory/projector', { total: 7, version: before.version })).status()).toBe(409)
  expect((await mutation(event.coordinator, 'PUT', '/api/equipment/inventory/projector', { total: 7, version: after.version })).status()).toBe(403)
  await equipment.stock('projector', 5)
})
