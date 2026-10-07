import { expect } from '@playwright/test'
import { test, field, signIn, created, mutation, validRequest, assignedSession, session, emails } from './helpers'

test('CS-27 AC01-04/06: real Return, saved amendment, same-ID resubmit and old/new history', async ({ page, playwright, owner }) => {
  await signIn(page)
  const submitted = await created(owner, 'submit', validRequest())
  const coordinator = await assignedSession(playwright.request, owner, submitted.id)
  try {
    const returnedResponse = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'amendments', notes: 'Please increase attendance <script>keep this text</script>', version: submitted.version })
    expect(returnedResponse.status()).toBe(200)
    const returned = await returnedResponse.json()
    expect((await mutation(owner, 'PUT', `/api/events/${submitted.id}`, { action: 'resubmit', version: returned.version })).status()).toBe(409)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByTestId('return-comments')).toContainText('Please increase attendance <script>keep this text</script>')
    await page.getByRole('button', { name: 'Edit request', exact: true }).click()
    await field(page, 'Expected attendance').fill('0')
    await page.getByRole('button', { name: 'Resubmit request', exact: true }).click()
    await expect(field(page, 'Expected attendance')).toHaveAttribute('aria-invalid', 'true')
    await expect(field(page, 'Expected attendance')).toHaveValue('0')
    await field(page, 'Expected attendance').fill('120')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible()
    const saved = await (await owner.get(`/api/events/${submitted.id}`)).json()
    expect(saved.status).toBe('RETURNED_FOR_AMENDMENT')
    await page.getByRole('button', { name: 'Edit request', exact: true }).click()
    const result = page.waitForResponse(response => response.url().endsWith(`/api/events/${submitted.id}`) && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Resubmit request', exact: true }).click()
    expect((await result).status()).toBe(200)
    await expect(page.getByRole('status').filter({ hasText: `Request ${submitted.id} submitted for review.` })).toBeVisible()
    await expect(field(page, 'Expected attendance')).toBeDisabled()
    const resubmitted = await (await owner.get(`/api/events/${submitted.id}`)).json()
    expect(resubmitted).toMatchObject({ id: submitted.id, status: 'SUBMITTED', expectedAttendance: 120, currentCoordinatorId: submitted.currentCoordinatorId })
    expect(resubmitted.revisedAt).toBeTruthy()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.getByTestId('history-entry').first()).toContainText('RESUBMITTED')
    await page.getByTestId('history-entry').filter({ hasText: 'REQUEST EDITED' }).locator('summary').click()
    await expect(page.getByTestId('history-entry').filter({ hasText: 'REQUEST EDITED' })).toContainText('100 → 120')
    const queue = await (await coordinator.get('/api/review-queue')).json()
    expect(queue.requests.some((entry: any) => entry.id === submitted.id)).toBe(true)
    const history = await (await owner.get(`/api/events/${submitted.id}/activity`)).json()
    expect(history.items.filter((entry: any) => entry.action === 'RESUBMITTED')).toHaveLength(1)
  }
  finally { await coordinator.dispose() }
})

test('CS-27 AC05: rejected/foreign edits remain denied through actual BFF', async ({ page, playwright, owner }) => {
  await signIn(page)
  const submitted = await created(owner, 'submit', validRequest())
  const coordinator = await assignedSession(playwright.request, owner, submitted.id)
  const foreign = await session(playwright.request, emails.other)
  try {
    expect((await mutation(foreign, 'PUT', `/api/events/${submitted.id}`, { action: 'resubmit', version: submitted.version, purpose: 'Foreign change' })).status()).toBe(403)
    const decision = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'reject', notes: 'Cannot accommodate this request', version: submitted.version })
    expect(decision.status()).toBe(200)
    const rejected = await decision.json()
    expect((await mutation(owner, 'PUT', `/api/events/${submitted.id}`, { action: 'resubmit', version: rejected.version, purpose: 'Rejected change' })).status()).toBe(409)
    await page.goto(`/requests/${submitted.id}`)
    await expect(field(page, 'Purpose')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Edit request', exact: true })).toHaveCount(0)
  }
  finally { await coordinator.dispose(); await foreign.dispose() }
})
