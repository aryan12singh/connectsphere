import { expect } from '@playwright/test'
import { test, field, signIn, completeForm, created, mutation, session, emails, eventService, waitForEventService } from './helpers'

test('CS-29 AC01-04: purpose-only private Draft, unsaved Stay, failed submission and same-ID submit', async ({ page, playwright, owner }) => {
  await signIn(page)
  await page.goto('/requests/new')
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled()
  await field(page, 'Purpose').fill('Gathering venue details')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/)
  const id = page.url().split('/').at(-1)!
  const draft = await (await owner.get(`/api/events/${id}`)).json()
  expect(draft.status).toBe('DRAFT')
  expect(draft.currentCoordinatorId).toBeNull()
  const coordinator = await session(playwright.request, emails.coordinator)
  try { expect((await coordinator.get(`/api/events/${id}`)).status()).toBe(403) }
  finally { await coordinator.dispose() }
  await field(page, 'Purpose').fill('Unsaved purpose')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'My requests', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/requests/${id}$`))
  await expect(field(page, 'Purpose')).toHaveValue('Unsaved purpose')
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Fields to correct' })).toBeVisible()
  expect((await (await owner.get(`/api/events/${id}`)).json()).version).toBe(draft.version)
  await completeForm(page)
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  await expect(page.getByTestId('coordinator-banner')).toBeVisible()
  const submitted = await (await owner.get(`/api/events/${id}`)).json()
  expect(submitted.id).toBe(id)
  expect(submitted.status).toBe('SUBMITTED')
  await expect(field(page, 'Purpose')).toBeDisabled()
})

test('CS-29 AC05: actual service outage retains saved Draft and typed input; retry saves once', async ({ page, owner }) => {
  await signIn(page)
  const draft = await created(owner, 'draft', { purpose: 'Previously saved purpose' })
  await page.goto(`/requests/${draft.id}`)
  await field(page, 'Purpose').fill('Purpose retained through outage')
  try {
    eventService('stop')
    const result = page.waitForResponse(response => response.url().endsWith(`/api/events/${draft.id}`) && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    expect((await result).status()).toBe(503)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(field(page, 'Purpose')).toHaveValue('Purpose retained through outage')
  }
  finally { eventService('start'); await waitForEventService(owner, draft.id) }
  const prior = await (await owner.get(`/api/events/${draft.id}`)).json()
  expect(prior.version).toBe(draft.version)
  expect(prior.purpose).toBe('Previously saved purpose')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible()
  const saved = await (await owner.get(`/api/events/${draft.id}`)).json()
  expect(saved.id).toBe(draft.id)
  expect(saved.version).toBe(draft.version + 1)
  expect(saved.purpose).toBe('Purpose retained through outage')
  const history = await (await owner.get(`/api/events/${draft.id}/activity`)).json()
  expect(history.items.map((entry: any) => entry.action)).toEqual(['REQUEST_EDITED', 'REQUEST_CREATED'])
  expect(saved.currentCoordinatorId).toBeNull()
})
