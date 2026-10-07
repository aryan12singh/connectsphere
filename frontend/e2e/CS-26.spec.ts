import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test, field, signIn, completeForm, created, validRequest, assignedSession, session, mutation, emails } from './helpers'
const password = 'IsolatedE2E!123';

test('TC-CS26-08 LIVE Organiser signup provisions Keycloak, organisation membership and a working request', async ({ page }) => {
  const email = `organiser-${randomUUID()}@example.test`
  await page.goto('/signup')
  await page.getByRole('combobox', { name: 'Account type' }).selectOption('EVENT_ORGANISER')
  await field(page, 'First name').fill('New'); await field(page, 'Last name').fill('Organiser')
  await field(page, 'Email').fill(email); await page.locator('#company').fill(`E2E Organisation ${randomUUID()}`)
  await field(page, 'Password').fill(password); await field(page, 'Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await signIn(page, email, password)
  // Chromium replays the live Secure cookie on localhost; the API client does not.
  const me = await page.evaluate(async () => { const r = await fetch('/api/auth/me'); return { status: r.status, body: await r.json() } }); expect(me.status).toBe(200)
  const identity = me.body; expect(identity.user.roles).toContain('EVENT_ORGANISER'); expect(identity.user.organisationId).toBeTruthy()
  await page.goto('/requests/new')
  await expect(page.getByRole('heading', { name: 'New event request' })).toBeVisible()
  await completeForm(page)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/)
})
test('TC-CS26-01 LIVE Attendee signup and duplicate-email field guidance preserve entered input', async ({ page }) => {
  const email = `attendee-${randomUUID()}@example.test`
  async function fill() {
    await page.goto('/signup')
    await field(page, 'First name').fill('New'); await field(page, 'Last name').fill('Attendee')
    await field(page, 'Email').fill(email); await field(page, 'Password').fill(password); await field(page, 'Confirm password').fill(password)
  }
  await fill(); await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await signIn(page, email, password, '/attendee')
  await expect(page).toHaveURL(/\/attendee$/)
  await page.context().clearCookies()
  await fill(); await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.locator('#email-error')).toContainText('already exists')
  await expect(field(page, 'Email')).toHaveValue(email)
  const denied = await page.request.post('/api/auth/register', { data: { role: 'VENUE_STAFF', firstName: 'Forged', lastName: 'Staff', email: `forged-${randomUUID()}@example.test`, password } })
  expect(denied.status()).toBe(400)
})

test('TC-CS26-14 LIVE only the assigned Coordinator can create an event booking; another Coordinator is denied', async ({ playwright, owner }) => {
  const submitted = await created(owner, 'submit', validRequest())
  const assigned = await assignedSession(playwright.request, owner, submitted.id)
  const contact = await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
  const otherEmail = contact.email === emails.coordinator ? 'kevin.ong@connectsphere.sg' : emails.coordinator
  const other = await session(playwright.request, otherEmail)
  try {
    const approval = await mutation(assigned, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
    expect(approval.status()).toBe(200)
    const event = await approval.json(); expect(event.eventId).toBeTruthy()
    const venues = await (await assigned.get('/api/venues')).json()
    const body = { eventId: event.eventId, venueId: venues.items[0].id, title: `Assigned booking ${randomUUID()}`, reason: 'Current Coordinator assignment', startAt: '2028-11-20T01:00:00Z', endAt: '2028-11-20T03:00:00Z', timeZone: 'Asia/Singapore', status: 'TENTATIVELY_HELD' }
    const booked = await mutation(assigned, 'POST', '/api/bookings', body)
    expect(booked.status()).toBe(200)
    const booking = await booked.json()
    expect((await assigned.get(`/api/bookings/${booking.id}`)).status()).toBe(200)
    const before = await (await assigned.get(`/api/bookings/history?venueId=${booking.venueId}`)).json()
    expect((await mutation(other, 'POST', '/api/bookings', body)).status()).toBe(403)
    expect((await other.get(`/api/bookings/${booking.id}`)).status()).toBe(403)
    expect((await mutation(assigned, 'POST', '/api/bookings', { ...body, eventId: randomUUID() })).status()).toBe(403)
    expect((await (await assigned.get(`/api/bookings/history?venueId=${booking.venueId}`)).json()).items).toEqual(before.items)
  } finally { await assigned.dispose(); await other.dispose() }
})
