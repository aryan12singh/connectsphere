import { test as baseTest, expect,type APIRequest,type APIRequestContext} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {created, validRequest, emails, mutation, session} from './helpers'
import { createVenue, hold, reviewDatabase } from './venue-fixtures'
import {safeConfirm} from './sprint4-fixtures'
export {expect, mutation, reviewDatabase, emails}
export type AttendanceEvent = {
  id: string, eventId: string, eventName: string, email: string, coordinator: APIRequestContext,
  date: string, rooms: any[], venueId?: string, primaryVenueId?: string,
}
function compose() {
  const file = process.env.CSE2E_COMPOSE_FILE
  if (!file) throw Error('An isolated review compose file is required')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  if (!/^csreview-aryan-ci-[a-z0-9-]+$/.test(config.name)) throw Error('Only the disposable review stack may be accessed')
  return { file, config }
}
export async function internal(service: 'venue'|'booking'|'event'|'attendance', route: string, method = 'GET', value?: unknown, extraHeaders?: Record<string,string>) {
  const { config } = compose()
  const port = config.services[`${service}-service`].ports[0].published
  const headers: Record<string,string> = { 'content-type': 'application/json', 'x-internal-api-key': 'change-me-dev-internal-key', ...extraHeaders }
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
  return { status: response.status, body: await response.json() }
}
export function serviceAction(service: 'attendance-service'|'rabbitmq', action: 'restart'|'stop'|'start') {
  const { file } = compose()
  execFileSync('docker', ['compose', '-f', file, action, service], { stdio: 'pipe' })
}
export async function snapshot(service: 'venue'|'booking'|'event'|'attendance', eventId: string) {
  return reviewDatabase(service, async pool => ({
    events: service === 'attendance' ? (await pool.query('SELECT * FROM events WHERE id=$1', [eventId])).rows : [],
    registrations: service === 'attendance' ? (await pool.query('SELECT * FROM registrations WHERE event_id=$1', [eventId])).rows : [],
  }))
}
async function insertAttendanceEvent(eventId: string, title: string, startAt: string, endAt: string, timeZone: string, primaryVenueId: string | null, primaryVenueName: string | null, registrationLimit: number | null, registrationWindow: unknown, organiserId: string | null) {
  await reviewDatabase('attendance', async pool => {
    await pool.query(
      `INSERT INTO events (id, "eventId", title, description, status, "startAt", "endAt", "timeZone", "primaryVenueId", "primaryVenueName", "registrationLimit", "registrationWindow", "organiserId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("eventId") DO NOTHING`,
      [eventId, eventId, title, title, startAt, endAt, timeZone, primaryVenueId, primaryVenueName, registrationLimit, JSON.stringify(registrationWindow), organiserId]
    )
  })
}
class AttendanceFixtures {
  private sessions = new Map<string, APIRequestContext>()
  private attendanceEventIds = new Set<string>()
  private sequence = 0
  private dateOffset = Number(process.env.CSE2E_DATE_OFFSET ?? Math.floor(Date.now() / 1000) % 100_000)
  constructor(private request: APIRequest, private worker: number) {}
  async actor(email: string) {
    if (!this.sessions.has(email)) this.sessions.set(email, await session(this.request, email))
    return this.sessions.get(email)!
  }
  async actorId(email: string) {
    const actor = await this.actor(email)
    const response = await actor.get('/api/auth/me')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.user?.id).toEqual(expect.any(String))
    return body.user.id as string
  }
  async event(options: { date?: string, rooms?: number, startAt?: string, endAt?: string, eventName?: string, registrationEnabled?: boolean, registrationLimit?: number } = {}): Promise<AttendanceEvent> {
    const date = options.date ?? new Date(Date.UTC(2038, 0, 1 + this.dateOffset + this.worker * 500 + this.sequence++)).toISOString().slice(0, 10)
    const owner = await this.actor(emails.owner)
    const submitted = await created(owner, 'submit', validRequest({ eventName: options.eventName ?? `E2E ${randomUUID()}`, proposedDate: date, expectedAttendance: 80, minimumCapacity: 80, accessibilityNeeds: [], venueRequirements: 'Projector', registrationEnabled: options.registrationEnabled ?? true, registrationOpensAt: `${date}T08:00`, registrationClosesAt: `${date}T08:30` }))
    const contact = await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
    const coordinator = await this.actor(contact.email)
    const approval = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
    expect(approval.status()).toBe(200)
    const approved = await approval.json()
    const staff = await this.actor(emails.staff)
    const rooms = []
    let primaryVenueId: string | undefined
    for (let i = 0; i < (options.rooms ?? 1); i++) {
      const venue = await createVenue(staff)
      if (!primaryVenueId) primaryVenueId = venue.id
      const room = await hold(coordinator, approved.eventId, venue.id, { startAt: options.startAt ?? `${date}T02:00:00.000Z`, endAt: options.endAt ?? `${date}T04:00:00.000Z`, expectedAttendance: 80 / (options.rooms ?? 1) })
      const decision = await mutation(staff, 'PUT', `/api/bookings/${room.id}/decision`, { version: room.version, status: 'CONFIRMED', reason: 'Attendance test precondition' })
      expect(decision.status()).toBe(200)
      rooms.push(await decision.json())
    }
    if(rooms.length)expect((await mutation(coordinator,'PUT',`/api/bookings/events/${approved.eventId}/primary-venue`,{bookingId:rooms[0].id,bookingVersion:rooms[0].version,version:0})).status()).toBe(200)
    await safeConfirm(coordinator,await this.actor(emails.officer),approved.eventId,submitted.id)
    // Attendance owns existing registration policy; current visibility/venues now come from source services.
    await insertAttendanceEvent(
      approved.eventId,
      submitted.eventName,
      `${date}T02:00:00.000Z`,
      `${date}T04:00:00.000Z`,
      'Asia/Singapore',
      primaryVenueId,
      primaryVenueId ? `Venue ${primaryVenueId.slice(-4)}` : null,
      options.registrationLimit ?? 100,
      { startAt: `${date}T02:00:00.000Z`, endAt: `${date}T04:00:00.000Z` },
      contact.email
    )
    this.attendanceEventIds.add(approved.eventId)
    return { id: submitted.id, eventId: approved.eventId, eventName: submitted.eventName, coordinator, email: contact.email, date, rooms, venueId: primaryVenueId, primaryVenueId }
  }
  async cancelledEvent() {
    const event = await this.event()
    const attendeeId = await this.actorId(emails.attendee)
    // Controlled cancellation precondition; this does not execute the separate CS-54 workflow.
    await reviewDatabase('event',async pool=>pool.query('UPDATE events SET status=\'CANCELLED\',"cancelledAt"=now(),"safetyToken"=NULL WHERE id=$1',[event.eventId]))
    await reviewDatabase('attendance', async pool => {
      await pool.query('UPDATE events SET status=$2 WHERE "eventId"=$1', [event.eventId, 'CANCELLED'])
      await pool.query(
        `INSERT INTO registrations (id, "eventId", "userId", status, "registeredAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [randomUUID(), event.eventId, attendeeId, 'CANCELLED', '2026-10-15T00:00:00.000Z']
      )
    })
    return event
  }
  async checkDetail(eventId: string, actor: APIRequestContext) {
    return actor.get(`/api/attendances/events/${encodeURIComponent(eventId)}`)
  }
  async checkOrganiserDetail(eventId: string, actor: APIRequestContext) {
    return actor.get(`/api/attendances/events/${encodeURIComponent(eventId)}/organiser`)
  }
  async checkRegistration(eventId: string, actor: APIRequestContext) {
    return actor.get(`/api/attendances/registrations/${encodeURIComponent(eventId)}`)
  }
  async cleanup() {
    if (this.attendanceEventIds.size === 0) return
    await reviewDatabase('event',async pool=>{await pool.query('UPDATE events SET status=\'CANCELLED\',"cancelledAt"=now(),"safetyToken"=NULL WHERE id = ANY($1::text[])',[[...this.attendanceEventIds]])})
    await reviewDatabase('attendance', async pool => {
      await pool.query('DELETE FROM events WHERE "eventId" = ANY($1::text[])', [[...this.attendanceEventIds]])
    })
  }
  async dispose() { for (const session of this.sessions.values()) await session.dispose() }
}
export const test = baseTest.extend<{ attendance: AttendanceFixtures }>({
  attendance: [async ({ playwright }, use, info) => {
    const fixtures = new AttendanceFixtures(playwright.request, info.workerIndex)
    try { await use(fixtures) } finally { await fixtures.cleanup(); await fixtures.dispose() }
  }, { scope: 'test' }],
})
