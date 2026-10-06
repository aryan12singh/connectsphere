import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test, field, signIn, completeForm, mutation, session, emails, validRequest } from './helpers'

test('CS-11 AC01-05: validated form, registration, receipt, assignment and submitted read-only', async ({ page, owner }) => {
  await signIn(page)
  await page.goto('/requests/new')
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Fields to correct' })).toContainText('eventName')
  await expect(field(page, 'Event name')).toHaveAttribute('aria-invalid', 'true')
  await completeForm(page)
  await field(page, 'Enable registration').check()
  await field(page, 'Registration opens').fill('2028-11-01T09:00')
  await field(page, 'Registration closes').fill('2028-11-18T17:00')
  const result = page.waitForResponse(response => response.url().endsWith('/api/events') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  const response = await result
  expect(response.status()).toBe(201)
  const record = await response.json()
  await expect(page.getByTestId('submission-receipt')).toContainText(record.id)
  await page.getByRole('link', { name: 'View your request', exact: true }).click()
  await expect(page.getByTestId('coordinator-banner')).toBeVisible()
  await expect(field(page, 'Purpose')).toBeDisabled()
  await expect(field(page, 'Registration opens')).toHaveValue('2028-11-01T09:00')
  const update = await mutation(owner, 'PUT', `/api/events/${record.id}`, { version: record.version, purpose: 'Forbidden overwrite' })
  expect(update.status()).toBe(409)
})

test('CS-11 AC04/06: concurrent replay creates one ID and private reads reject another Organiser', async ({ playwright }) => {
  const owner = await session(playwright.request)
  const other = await session(playwright.request, emails.other)
  try {
    const key = randomUUID(), body = { ...validRequest(), saveAs: 'submit' }
    const responses = await Promise.all([mutation(owner, 'POST', '/api/events', body, key), mutation(owner, 'POST', '/api/events', body, key)])
    expect(responses.map(response => response.status())).toEqual([201, 201])
    const records = await Promise.all(responses.map(response => response.json()))
    expect(records[0].id).toBe(records[1].id)
    expect((await other.get(`/api/events/${records[0].id}`)).status()).toBe(403)
    expect((await other.get(`/api/events/${records[0].id}/activity`)).status()).toBe(403)
  }
  finally { await owner.dispose(); await other.dispose() }
})

test('CS-11 accessibility: mandatory name and purpose are announced to assistive technology', async ({ page, owner }) => {
  await signIn(page)
  await page.goto('/requests/new')
  await expect(field(page, 'Event name')).toHaveAttribute('aria-required', 'true')
  await expect(field(page, 'Purpose')).toHaveAttribute('aria-required', 'true')
})
