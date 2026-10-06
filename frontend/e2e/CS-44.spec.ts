import { expect } from '@playwright/test'
import { test, field, signIn, created, mutation, validRequest, assignedSession, session, emails } from './helpers'

test('CS-44 AC01-03/05: 20/21 history boundary displays every immutable entry once', async ({ page, owner }) => {
  await signIn(page)
  let draft = await created(owner, 'draft', { purpose: 'History boundary 0' })
  for (let index = 1; index <= 20; index++) {
    const response = await mutation(owner, 'PUT', `/api/events/${draft.id}`, { version: draft.version, purpose: `History boundary ${index}` })
    expect(response.status()).toBe(200)
    draft = await response.json()
  }
  await page.goto(`/requests/${draft.id}`)
  await page.getByRole('tab', { name: 'History', exact: true }).click()
  await expect(page.getByTestId('history-entry')).toHaveCount(20)
  const firstPage = await page.getByTestId('history-entry').locator('summary').allTextContents()
  await page.getByRole('button', { name: 'Load older activity', exact: true }).click()
  await expect(page.getByTestId('history-entry')).toHaveCount(21)
  const all = await page.getByTestId('history-entry').locator('summary').allTextContents()
  expect(all.slice(0, 20)).toEqual(firstPage)
  expect(all.at(-1)).toContain('REQUEST CREATED')
  await expect(page.getByRole('button', { name: 'Load older activity', exact: true })).toHaveCount(0)
  const deletion = await owner.delete(`/api/events/${draft.id}/activity`, { headers: { origin: new URL(page.url()).origin } })
  expect([404, 405]).toContain(deletion.status())
  const history = await (await owner.get(`/api/events/${draft.id}/activity`)).json()
  expect(history.items).toHaveLength(20)
})

test('CS-44 AC02/03/06: distinct Event history is accessible to same organisation and denies foreign/Attendee', async ({ page, playwright, owner }) => {
  await signIn(page)
  const submitted = await created(owner, 'submit', validRequest())
  const coordinator = await assignedSession(playwright.request, owner, submitted.id)
  const same = await session(playwright.request, emails.same), other = await session(playwright.request, emails.other), attendee = await session(playwright.request, emails.attendee)
  try {
    const decision = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
    expect(decision.status()).toBe(200)
    const approved = await decision.json()
    expect(approved.eventId).not.toBe(submitted.id)
    expect((await same.get(`/api/event-history/${approved.eventId}`)).status()).toBe(200)
    expect((await same.get(`/api/events/${submitted.id}/activity`)).status()).toBe(403)
    expect((await other.get(`/api/event-history/${approved.eventId}`)).status()).toBe(403)
    expect((await attendee.get(`/api/event-history/${approved.eventId}`)).status()).toBe(403)
    await page.goto(`/events/${approved.eventId}`)
    await expect(page.getByRole('heading', { name: 'Event history', exact: true })).toBeVisible()
    await expect(page.getByTestId('history-entry').first()).toBeVisible()
    const history = await (await owner.get(`/api/event-history/${approved.eventId}`)).json()
    expect(JSON.stringify(history)).not.toMatch(/tokenHash|passwordHash|authorization|bearerToken/)
  }
  finally { await coordinator.dispose(); await same.dispose(); await other.dispose(); await attendee.dispose() }
})

test('CS-44 accessibility: keyboard arrows switch and focus request tabs without losing Draft input', async ({ page, owner }) => {
  await signIn(page)
  const draft = await created(owner, 'draft', { purpose: 'Keyboard retained input' })
  const serverPage = await owner.get(`/requests/${draft.id}`)
  expect(serverPage.status()).toBe(200)
  const serverHTML = await serverPage.text()
  for (const name of ['details', 'history']) {
    expect(new RegExp(`<button[^>]*id="request-${name}-tab"[^>]*disabled`).test(serverHTML), 'Server-rendered tabs must wait for their keyboard handlers').toBe(true)
  }
  await page.goto(`/requests/${draft.id}`)
  await field(page, 'Purpose').fill('Unsaved keyboard input')
  const details = page.getByRole('tab', { name: 'Details', exact: true })
  const history = page.getByRole('tab', { name: 'History', exact: true })
  await expect(details).toBeEnabled()
  await details.focus()
  await details.press('ArrowRight')
  await expect(history).toBeFocused()
  await expect(history).toHaveAttribute('aria-selected', 'true')
  await history.press('ArrowLeft')
  await expect(details).toBeFocused()
  await details.press('End')
  await expect(history).toBeFocused()
  await history.press('Home')
  await expect(details).toBeFocused()
  await expect(field(page, 'Purpose')).toHaveValue('Unsaved keyboard input')
})
