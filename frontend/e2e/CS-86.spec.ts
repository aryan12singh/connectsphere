import { test, created, validRequest, assignedSession, session, emails, mutation, signIn } from './helpers'
import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('TC-CS86-03 LIVE Staff compare retained approvals and recheck inherited buffer conflicts', async ({ page, playwright, owner }, testInfo) => {
  const staff = await session(playwright.request, emails.staff)
  const coordinators = []
  try {
    const suffix = randomUUID()
    const input = { name: `Conflict review ${suffix}`, address: 'Synthetic review venue', capacity: 120, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: ['PROJECTOR'], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'a1000000-0000-4000-8000-000000000008', reason: 'Isolated inherited-conflict fixture', setupMinutes: 0, turnaroundMinutes: 0, operatingHours: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(weekday => ({ weekday, isClosed: false, opensAt: '08:00', closesAt: '20:00' })) }
    const response = await mutation(staff, 'POST', '/api/venues', input)
    expect(response.status()).toBe(200)
    const venue = await response.json(), rooms = []
    for (let i = 0; i < 2; i++) {
      const submitted = await created(owner, 'submit', validRequest({ eventName: `Retained event ${i} ${suffix}`, expectedAttendance: 80, minimumCapacity: 80, accessibilityNeeds: [] }))
      const coordinator = await assignedSession(playwright.request, owner, submitted.id)
      coordinators.push(coordinator)
      const approved = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
      expect(approved.status()).toBe(200)
      const event = await approved.json()
      const held = await mutation(coordinator, 'POST', '/api/bookings', { eventId: event.eventId, venueId: venue.id, title: `Retained event ${i} ${suffix}`, reason: 'Conference room', startAt: i ? '2028-11-20T04:15:00.000Z' : '2028-11-20T02:00:00.000Z', endAt: i ? '2028-11-20T06:00:00.000Z' : '2028-11-20T04:00:00.000Z', timeZone: 'Asia/Singapore', expectedAttendance: 80 })
      expect(held.status()).toBe(200)
      const room = await held.json()
      const decision = await mutation(staff, 'PUT', `/api/bookings/${room.id}/decision`, { version: room.version, status: 'CONFIRMED', reason: 'Capacity and layout verified' })
      expect(decision.status()).toBe(200)
      rooms.push(await decision.json())
    }
    const changed = await mutation(staff, 'PUT', `/api/venues/${venue.id}`, { ...input, version: venue.version, turnaroundMinutes: 45, reason: 'Longer reset is operationally required' })
    expect(changed.status()).toBe(200)
    await signIn(page, emails.staff)
    await page.getByRole('button', { name: 'Buffer conflicts', exact: true }).click()
    await page.getByRole('navigation', { name: 'Flagged venue bookings' }).getByRole('button').filter({ hasText: rooms[0].title }).click()
    await expect(page.locator('.conflict-pane')).toHaveCount(2)
    for (const room of rooms) await expect(page.locator(`.conflict-pane[data-booking-id="${room.id}"]`)).toContainText('Venue approved')
    await expect(page.locator('.conflict-pane').first()).toContainText('12:45')
    await expect(page.locator('.conflict-pane').last()).toContainText('12:15')
    await page.screenshot({ path: testInfo.outputPath('CS-86-03-retained-conflict-windows.png'), fullPage: true })
    await page.getByText('Recheck existing bookings after buffer rollout', { exact: true }).click()
    await page.locator(`#recheck-reason-${venue.id}`).fill('Verify the initial buffer rollout')
    const section = page.locator(`#recheck-reason-${venue.id}`).locator('..').locator('..')
    await section.getByRole('button', { name: 'Recheck existing bookings', exact: true }).click()
    await expect(page.getByRole('status')).toContainText(`${venue.name}: recheck complete`)
    for (const room of rooms) {
      const current = await (await staff.get(`/api/bookings/${room.id}`)).json()
      expect(current.status).toBe('CONFIRMED')
      expect(current.flags).toContain('BUFFER_CONFLICT')
      const deletion = await mutation(staff, 'DELETE', `/api/bookings/${room.id}`, {})
      expect(deletion.status()).toBe(405)
    }
    await page.screenshot({ path: testInfo.outputPath('CS-86-09-audited-rollout-recheck.png'), fullPage: true })
  } finally {
    for (const coordinator of coordinators) await coordinator.dispose()
    await staff.dispose()
  }
})
