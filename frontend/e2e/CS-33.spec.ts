import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test, session, mutation, emails } from './helpers'

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
