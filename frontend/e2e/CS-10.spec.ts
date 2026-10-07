import { expect } from '@playwright/test'
import { test, signIn, emails } from './helpers'

test('TC-CS10-06 LIVE all five roles reach functional homes and forbidden typed routes are denied', async ({ page }) => {
  test.setTimeout(360_000)
  for (const [email, heading] of [[emails.owner, 'My events'], [emails.coordinator, 'My events'], [emails.staff, 'Manage venues'], [emails.attendee, 'Attendee home'], [emails.support, 'Technical Support']]) {
    await page.context().clearCookies()
    await signIn(page, email)
    if (email === emails.owner || email === emails.coordinator) await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    else await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    if (email === emails.attendee || email === emails.staff) {
      await page.goto('/requests/forbidden-id')
      await expect(page).toHaveURL(/\/access-denied$/)
    }
  }
})
test('TC-CS10-12 LIVE multi-role switch survives reload; unassigned roles cannot be selected', async ({ page }) => {
  await signIn(page, emails.multi)
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('combobox', { name: 'Active role' }).selectOption('ATTENDEE')
  await expect(page).toHaveURL(/\/attendee$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Attendee home' })).toBeVisible()
  // Use Chromium's current Secure cookie, including the selected role.
  const denied = await page.evaluate(async () => (await fetch('/api/auth/role', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'TECHNICAL_SUPPORT_STAFF' }) })).status)
  expect(denied).toBe(403)
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('combobox', { name: 'Active role' }).selectOption('EVENT_ORGANISER')
  await expect(page).toHaveURL(new URL('/', page.url()).href)
})

test.describe('CS-10 credential form before hydration', () => {
  test.use({ javaScriptEnabled: false })
  test('TC-CS10-17 LIVE SSR credential inputs and submit stay disabled before handlers attach', async ({ page }) => {
    await page.goto('/login')
    await expect(field(page, 'Email')).toBeDisabled()
    await expect(field(page, 'Password')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
  })
})
