import { test as baseTest, expect, type APIRequest, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export const baseURL = process.env.FRONTEND_BASE || 'http://127.0.0.1:33000'
const realm = JSON.parse(readFileSync(new URL('../../infra/keycloak/connectsphere-realm.json', import.meta.url), 'utf8'))
export const emails = {
  owner: 'sarah.tan@nexuslabs.sg',
  same: 'daniel.lim@brightpath.edu.sg',
  other: 'marcus.wong@orbitfintech.com',
  attendee: 'ethan.goh@gmail.com',
  coordinator: 'aisha.rahman@connectsphere.sg',
  staff: 'ravi.kumar@marinaconvention.sg',
}

function credentials(email: string) {
  const user = realm.users.find((user: any) => user.email === email)
  if (!user) throw new Error('Missing checked-in synthetic credential fixture')
  return { email: user.email, password: user.credentials.find((credential: any) => credential.type === 'password').value }
}

export function field(page: Page, label: string) {
  const literal = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.getByLabel(new RegExp(`^\\s*${literal}\\s*\\*?\\s*$`))
}

async function rateLimitPause(headers: Record<string, string>) {
  const seconds = Math.min(60, Math.max(1, Number(headers['retry-after']) || 60))
  // Honour the unchanged gateway's 10 logins/minute policy, including BFF calls.
  // This is authentication setup backoff; tests themselves have no reruns.
  await new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

export async function signIn(page: Page, email = emails.owner) {
  await page.goto('/login')
  const fixture = credentials(email)
  await field(page, 'Email').fill(fixture.email)
  await field(page, 'Password').fill(fixture.password)
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = page.waitForResponse(response => response.url().endsWith('/api/auth') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const response = await result
    if (response.status() !== 429) { expect(response.status()).toBe(200); break }
    expect(attempt, 'Gateway kept rate limiting live login').toBeLessThan(2)
    await rateLimitPause(response.headers())
  }
  await expect(page).toHaveURL(new URL(email === emails.staff ? '/venue' : '/', baseURL).href)
}

export async function session(request: APIRequest, email = emails.owner) {
  const context = await request.newContext({ baseURL })
  let response = await context.post('/api/auth', { data: credentials(email), headers: { origin: new URL(baseURL).origin } })
  for (let attempt = 0; response.status() === 429 && attempt < 2; attempt++) {
    await rateLimitPause(response.headers())
    await response.dispose()
    response = await context.post('/api/auth', { data: credentials(email), headers: { origin: new URL(baseURL).origin } })
  }
  expect(response.status()).toBe(200)
  // Chromium accepts localhost development's Secure cookie. The API client does
  // not replay it over HTTP, so preserve the real sealed cookie explicitly.
  // Never print this header or save authentication traces.
  const cookie = response.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => header.value.split(';')[0]).join('; ')
  expect(cookie).not.toBe('')
  await context.dispose()
  return request.newContext({ baseURL, extraHTTPHeaders: { cookie, origin: new URL(baseURL).origin } })
}

export const test = baseTest.extend<{ owner: APIRequestContext }>({
  owner: async ({ playwright }, use) => {
    const owner = await session(playwright.request)
    try { await use(owner) }
    finally { await owner.dispose() }
  },
})

export async function mutation(context: APIRequestContext, method: string, path: string, data: any, key = randomUUID()) {
  return context.fetch(path, {
    method,
    headers: { origin: new URL(baseURL).origin, 'idempotency-key': key },
    data,
  })
}

export function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    eventName: `E2E ${randomUUID()}`,
    purpose: 'Independent live browser verification',
    proposedDate: '2028-11-20', startTime: '09:00', endTime: '17:00',
    timeZone: 'Asia/Singapore', expectedAttendance: 100,
    venueType: 'physical', preferredLayout: 'theatre', venueRequirements: 'Accessible meeting room',
    registrationEnabled: false,
    ...overrides,
  }
}

export async function completeForm(page: Page, name = `Browser ${randomUUID()}`) {
  await field(page, 'Event name').fill(name)
  await field(page, 'Purpose').fill('Customer event planning')
  await field(page, 'Proposed date').fill('2028-11-20')
  await field(page, 'Start time').fill('09:00')
  await field(page, 'End time').fill('17:00')
  await field(page, 'Time zone').fill('Asia/Singapore')
  await field(page, 'Expected attendance').fill('100')
  await field(page, 'Venue type').selectOption('physical')
  await field(page, 'Preferred layout (choose Other when needed)').selectOption('theatre')
  await field(page, 'Venue / location requirements').fill('Accessible meeting room')
  return name
}

export async function created(context: APIRequestContext, saveAs: 'draft' | 'submit', values: Record<string, unknown>) {
  const response = await mutation(context, 'POST', '/api/events', { ...values, saveAs })
  expect(response.status()).toBe(201)
  return response.json()
}

export async function assignedSession(request: APIRequest, owner: APIRequestContext, id: string) {
  const response = await owner.get(`/api/events/${id}/coordinator`)
  expect(response.status()).toBe(200)
  const coordinator = await response.json()
  return session(request, coordinator.email)
}

export function eventService(action: 'stop' | 'start') {
  const file = process.env.CSE2E_COMPOSE_FILE
  if (!file) throw new Error('CSE2E_COMPOSE_FILE is required for the real service-outage test')
  const compose = JSON.parse(readFileSync(file, 'utf8'))
  if (!/^csreview-aryan-(overnight|ci)-[a-z0-9-]+$/.test(compose.name)) {
    throw new Error('Only this runner\'s disposable Aryan project may be stopped')
  }
  execFileSync('docker', ['compose', '-f', file, action, 'event-service'], { stdio: 'pipe' })
}

export async function waitForEventService(context: APIRequestContext, id: string) {
  await expect.poll(async () => (await context.get(`/api/events/${id}`)).status(), { timeout: 45_000 }).toBe(200)
}
