import { test as base, expect, type APIRequest, type APIRequestContext, type WorkerInfo } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { created, validRequest, emails, mutation, session } from './helpers'
import { createVenue, hold, reviewDatabase } from './venue-fixtures'

export { expect, mutation, reviewDatabase, emails }
export type Line = { equipmentType: string, quantity: number, venueId?: string }
export type TechnicalEvent = { id: string, eventId: string, email: string, coordinator: APIRequestContext, date: string, rooms: any[], period: { startAt: string, endAt: string }, venueId?: string }
export const body = (equipment: Line[], extra: Record<string, unknown> = {}) => ({ version: 1, equipment, supportRequired: false, supportDetails: '', placementDetails: 'At the lectern, clear of emergency access', notRequired: false, ...extra })
export const path = (event: TechnicalEvent) => `/api/events/${event.id}/technical-request`
export const availabilityPath = (event: TechnicalEvent) => `/api/equipment/requests/${event.id}/availability`
export const reservePath = (event: TechnicalEvent) => `/api/equipment/requests/${event.id}/reserve`

function compose() {
  const file = process.env.CSE2E_COMPOSE_FILE
  if (!file) throw Error('An isolated review compose file is required')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  if (!/^csreview-aryan-ci-[a-z0-9-]+$/.test(config.name)) throw Error('Only the disposable review stack may be accessed')
  return { file, config }
}
export async function internal(service: 'equipment' | 'booking', route: string, method = 'GET', value?: unknown) {
  const { config } = compose()
  const port = config.services[`${service}-service`].ports[0].published
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json', 'x-internal-api-key': 'change-me-dev-internal-key' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
  return { status: response.status, body: await response.json() }
}
export function serviceAction(service: 'equipment-service' | 'rabbitmq', action: 'restart' | 'stop' | 'start') {
  const { file } = compose()
  execFileSync('docker', ['compose', '-f', file, action, service], { stdio: 'pipe' })
}
export async function snapshot(event: TechnicalEvent) {
  return reviewDatabase('equipment', async pool => ({
    requests: (await pool.query('SELECT * FROM technical_requests WHERE "eventRequestId"=$1', [event.id])).rows,
    history: (await pool.query('SELECT h.* FROM technical_request_history h JOIN technical_requests r ON r.id=h."requestId" WHERE r."eventRequestId"=$1 ORDER BY h.id', [event.id])).rows,
    outbox: (await pool.query('SELECT id,"actionKey","eventType",payload FROM outbox_events WHERE "actionKey" LIKE $1 ORDER BY id', [`%:${event.id}:%`])).rows,
    reservations: (await pool.query('SELECT * FROM equipment_reservations WHERE "eventRequestId"=$1 ORDER BY id', [event.id])).rows,
  }))
}
export async function fault(event: TechnicalEvent, kind: 'TechRequestSubmitted' | 'EquipmentReserved', work: () => Promise<void>) {
  // PostgreSQL trigger is limited to one synthetic request in this review DB.
  const name = `e2e_${randomUUID().replaceAll('-', '')}`
  await reviewDatabase('equipment', async pool => {
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='${kind}' AND NEW."actionKey" LIKE '%:${event.id}:%' THEN RAISE EXCEPTION 'isolated acceptance rollback'; END IF; RETURN NEW; END $$`)
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION ${name}()`)
  })
  try { await work() }
  finally { await reviewDatabase('equipment', async pool => { await pool.query(`DROP TRIGGER ${name} ON outbox_events`); await pool.query(`DROP FUNCTION ${name}()`); }) }
}

class EquipmentFixtures {
  private sessions = new Map<string, APIRequestContext>()
  private eventRequestIds = new Set<string>()
  private operationStartAt = new Set<string>()
  private stockBefore = new Map<string, number>()
  private sequence = 0
  constructor(private request: APIRequest, private dateOffset: number) {}
  async actor(email: string) {
    if (!this.sessions.has(email)) this.sessions.set(email, await session(this.request, email))
    return this.sessions.get(email)!
  }
  async stock(type: string, total: number) {
    const support = await this.actor(emails.support)
    const read = await support.get('/api/equipment/inventory')
    expect(read.status()).toBe(200)
    const item = (await read.json()).items.find((item: any) => item.equipmentType === type)
    if (!this.stockBefore.has(type)) this.stockBefore.set(type, item.total)
    const saved = await mutation(support, 'PUT', `/api/equipment/inventory/${type}`, { version: item.version, total })
    expect(saved.status()).toBe(200)
    return saved.json()
  }
  async establishBaseline() {
    // The seed database intentionally starts with no usable equipment.  Each
    // test receives the same small, explicit catalogue instead of inheriting
    // stock written by an earlier spec.
    await this.stock('projector', 5)
    await this.stock('speaker', 5)
  }
  async event(options: { date?: string, rooms?: number, startAt?: string, endAt?: string, eventName?: string } = {}): Promise<TechnicalEvent> {
    const date = options.date ?? new Date(Date.UTC(2038, 0, 1 + this.dateOffset + this.sequence++)).toISOString().slice(0, 10)
    const owner = await this.actor(emails.owner)
    const submitted = await created(owner, 'submit', validRequest({ eventName: options.eventName ?? `E2E ${randomUUID()}`, proposedDate: date, expectedAttendance: 80, minimumCapacity: 80, accessibilityNeeds: [] }))
    const contact = await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
    const coordinator = await this.actor(contact.email)
    const approval = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
    expect(approval.status()).toBe(200)
    const approved = await approval.json()
    const staff = await this.actor(emails.staff)
    const rooms = []
    let venueId: string | undefined
    for (let i = 0; i < (options.rooms ?? 1); i++) {
      const venue = await createVenue(staff)
      if (!venueId) venueId = venue.id
      const room = await hold(coordinator, approved.eventId, venue.id, { startAt: options.startAt ?? `${date}T02:00:00.000Z`, endAt: options.endAt ?? `${date}T04:00:00.000Z`, expectedAttendance: 80 / (options.rooms ?? 1) })
      const decision = await mutation(staff, 'PUT', `/api/bookings/${room.id}/decision`, { version: room.version, status: 'CONFIRMED', reason: 'Technical request test precondition' })
      expect(decision.status()).toBe(200)
      rooms.push(await decision.json())
    }
    this.eventRequestIds.add(submitted.id)
    return { id: submitted.id, eventId: approved.eventId, coordinator, email: contact.email, date, rooms, venueId, period: { startAt: new Date(Date.parse(options.startAt ?? `${date}T02:00:00.000Z`) - 30 * 60_000).toISOString(), endAt: new Date(Date.parse(options.endAt ?? `${date}T04:00:00.000Z`) + 45 * 60_000).toISOString() } }
  }
  async submit(event: TechnicalEvent, lines: Line[] = [{ equipmentType: 'projector', quantity: 2 }], extra: Record<string, unknown> = {}) {
    const linesWithVenue = lines.map(line => ({
      ...line,
      venueId: line.venueId ?? event.venueId,
    }))
    const response = await mutation(event.coordinator, 'POST', path(event), body(linesWithVenue, extra))
    expect(response.status()).toBe(200)
    return response.json()
  }
  async approve(event: TechnicalEvent, version = 1) {
    const response = await mutation(await this.actor(emails.support), 'POST', `${path(event)}/decision`, { version, decision: 'APPROVED' })
    expect(response.status()).toBe(200)
    return response.json()
  }
  async reserve(event: TechnicalEvent, version = 1, key = randomUUID()) {
    return mutation(await this.actor(emails.support), 'POST', reservePath(event), { version }, key)
  }
  async check(event: TechnicalEvent) {
    const result = await (await this.actor(emails.support)).get(availabilityPath(event))
    expect(result.status()).toBe(200)
    return result.json()
  }
  async operation(event: TechnicalEvent, quantity = 1, extra: Record<string, unknown> = {}, key = randomUUID()) {
    this.operationStartAt.add(event.period.startAt)
    return mutation(await this.actor(emails.support), 'POST', '/api/equipment/operations', { equipmentType: 'projector', quantity, reason: 'Scheduled maintenance', ...event.period, ...extra }, key)
  }
  async cleanup() {
    await reviewDatabase('equipment', async pool => {
      const eventRequestIds = [...this.eventRequestIds]
      if (eventRequestIds.length) {
        await pool.query('DELETE FROM equipment_reservations WHERE "eventRequestId" = ANY($1::text[])', [eventRequestIds])
        await pool.query('DELETE FROM technical_readiness_fences WHERE "eventRequestId" = ANY($1::text[])', [eventRequestIds])
        await pool.query('DELETE FROM outbox_events WHERE "actionKey" LIKE ANY($1::text[])', [eventRequestIds.map(id => `%:${id}:%`)])
        await pool.query('DELETE FROM technical_requests WHERE "eventRequestId" = ANY($1::text[])', [eventRequestIds])
      }
      const operationStartAt = [...this.operationStartAt]
      if (operationStartAt.length) await pool.query('DELETE FROM equipment_operational_unavailability WHERE "startAt" = ANY($1::timestamptz[])', [operationStartAt])
    })
    if (this.stockBefore.size) {
      const support = await this.actor(emails.support)
      for (const [type, total] of this.stockBefore) {
        const read = await support.get('/api/equipment/inventory')
        expect(read.status()).toBe(200)
        const item = (await read.json()).items.find((candidate: any) => candidate.equipmentType === type)
        const restored = await mutation(support, 'PUT', `/api/equipment/inventory/${type}`, { version: item.version, total })
        expect(restored.status()).toBe(200)
      }
    }
    this.eventRequestIds.clear()
    this.operationStartAt.clear()
    this.stockBefore.clear()
  }
  async dispose() { for (const session of this.sessions.values()) await session.dispose() }
}
function fixtureDateOffset(info: WorkerInfo) {
  let hash = 0
  for (const character of `${info.project.name}:${info.workerIndex}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash % 20_000
}
export const test = base.extend<{ isolateEquipment: void }, { equipment: EquipmentFixtures }>({
  equipment: [async ({ playwright }, use, info) => {
    const fixtures = new EquipmentFixtures(playwright.request, fixtureDateOffset(info))
    try { await use(fixtures) } finally { await fixtures.dispose() }
  }, { scope: 'worker' }],
  isolateEquipment: [async ({ equipment }, use) => {
    await equipment.establishBaseline()
    try { await use() } finally { await equipment.cleanup() }
  }, { auto: true }],
})
