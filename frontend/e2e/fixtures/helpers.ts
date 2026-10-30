import { test as baseTest, expect, request as playwrightRequest, type APIRequest, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

export const baseURL = process.env.FRONTEND_BASE || 'http://127.0.0.1:33000'
const realm = JSON.parse(readFileSync(new URL('../../../infra/keycloak/connectsphere-realm.json', import.meta.url), 'utf8'))
export const emails = {
  owner: 'sarah.tan@nexuslabs.sg',
  same: 'daniel.lim@brightpath.edu.sg',
  other: 'marcus.wong@orbitfintech.com',
  attendee: 'ethan.goh@gmail.com',
  otherAttendee: 'nur.aisyah@outlook.com',
  coordinator: 'aisha.rahman@connectsphere.sg',
  lead: 'jordan.lim@connectsphere.sg',
  staff: 'ravi.kumar@marinaconvention.sg',
  support: 'hafiz.ismail@connectsphere.sg',
  officer:'alex.chen@connectsphere.sg',
  multi: 'priya.raman@greenleaf.org.sg',
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

export async function signIn(page: Page, email = emails.owner, password?: string, expectedHome?: string) {
  await page.goto('/login')
  const fixture = password ? { email, password } : credentials(email)
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
  await expect(page).toHaveURL(new URL(expectedHome ?? (email === emails.staff ? '/venue' : email === emails.attendee || email === emails.otherAttendee ? '/attendances' : email === emails.support ? '/technical-requirements' : '/'), baseURL).href)
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
  await field(page, 'Venue type').click()
  await page.getByRole('option', { name: 'Physical', exact: true }).click()
  await field(page, 'Preferred layout').click()
  await page.getByRole('option', { name: 'Theatre', exact: true }).click()
  await field(page, 'Venue or location requirements').fill('Accessible meeting room')
  return name
}

let leadSession: Promise<APIRequestContext> | undefined
let leadChoice: string | undefined

// Week 7: a first submission stays unassigned, so the Lead assigns a Coordinator.
export async function assignAsLead(id: string, version: number) {
  leadSession ??= session(playwrightRequest, emails.lead)
  const lead = await leadSession
  if (!leadChoice) {
    const list = await lead.get('/api/coordinators')
    expect(list.status(), 'Lead can list Coordinators').toBe(200)
    const items: Array<{ id: string, name: string }> = (await list.json()).items
    leadChoice = (items.find(item => /aisha/i.test(item.name)) ?? items[0])?.id
    expect(leadChoice, 'A Coordinator exists to assign').toBeTruthy()
  }
  const assigned = await mutation(lead, 'POST', `/api/events/${id}/assign`, { coordinatorId: leadChoice, version })
  expect(assigned.status(), await assigned.text()).toBe(200)
  return assigned.json()
}

export async function created(context: APIRequestContext, saveAs: 'draft' | 'submit', values: Record<string, unknown>, options: { assign?: boolean } = {}) {
  const response = await mutation(context, 'POST', '/api/events', { ...values, saveAs })
  expect(response.status()).toBe(201)
  const record = await response.json()
  if (saveAs === 'submit' && options.assign !== false && record.status === 'SUBMITTED') return assignAsLead(record.id, record.version)
  return record
}

export async function assignedSession(request: APIRequest, owner: APIRequestContext, id: string) {
  const response = await owner.get(`/api/events/${id}/coordinator`)
  expect(response.status()).toBe(200)
  const coordinator = await response.json()
  return session(request, coordinator.email)
}

function reviewCompose() {
  const file = process.env.CSE2E_COMPOSE_FILE
  if (!file) throw new Error('CSE2E_COMPOSE_FILE is required for the real service-outage test')
  const compose = JSON.parse(readFileSync(file, 'utf8'))
  if (!/^csreview-aryan-(overnight|ci)-[a-z0-9-]+$/.test(compose.name)) {
    throw new Error('Only this runner\'s disposable Aryan project may be changed')
  }
  return file
}

export function eventService(action: 'stop' | 'start') {
  const file = reviewCompose()
  execFileSync('docker', ['compose', '-f', file, action, 'event-service'], { stdio: 'pipe' })
}
export async function withVenueStopped<T>(work: () => Promise<T>): Promise<T> {
  const file = reviewCompose()
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const port = (name: string) => Number(config.services[name].ports[0].published)
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-f', file, ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 30_000 })
  const commandOutput = (args: string[]) => {
    try { return compose(...args).trim() }
    catch (error: any) { return `${error.message}: ${String(error.stderr ?? '').trim()}` }
  }
  const probe = async () => {
    const status = async (url: string) => {
      try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).status }
      catch { return 0 }
    }
    const [direct, gateway] = await Promise.all([
      status(`http://127.0.0.1:${port('venue-service')}/health`),
      status(`http://127.0.0.1:${port('kong')}/venues`),
    ])
    return { direct, gateway }
  }
  const diagnose = () => {
    const id = commandOutput(['ps', '-aq', 'venue-service'])
    let state: string
    try { state = execFileSync('docker', ['inspect', '--format', '{{.State.Status}} running={{.State.Running}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} {{range .NetworkSettings.Networks}}aliases={{json .Aliases}}{{end}}', id], { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 }).trim() }
    catch (error: any) { state = `inspect failed: ${error.message}` }
    return `Container: ${state}\nKong DNS: ${commandOutput(['exec', '-T', 'kong', 'getent', 'hosts', 'venue-service'])}\nVenue logs:\n${commandOutput(['logs', '--tail', '30', '--no-color', 'venue-service'])}`
  }
  const { restoreVenue, withStoppedVenue } = createRequire(import.meta.url)('./venue-recovery.cjs')
  return withStoppedVenue({
    stop: () => compose('stop', 'venue-service'),
    work,
    restore: () => restoreVenue({
      start: () => compose('start', 'venue-service'),
      probe,
      diagnose,
      recreate: () => compose('up', '-d', '--no-deps', '--force-recreate', 'venue-service'),
    }),
  })
}

export function recreateBookingService() {
  const file = reviewCompose()
  execFileSync('docker', ['compose', '-f', file, 'up', '-d', '--no-deps', '--force-recreate', 'booking-service'], { stdio: 'pipe' })
}

export async function waitForEventService(context: APIRequestContext, id: string) {
  await expect.poll(async () => (await context.get(`/api/events/${id}`)).status(), { timeout: 45_000 }).toBe(200)
}
