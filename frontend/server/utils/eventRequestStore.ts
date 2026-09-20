import { MOCK_USERS } from './mockUserDb'
import { SEED_REQUESTS } from './eventMocks'
import type { EventRequestForm, EventRequestRecord, RequestStatus } from '../api/events.post'

/**
 * In-memory mock standing in for event-service persistence (requests +
 * coordinator assignments). Data lives here; the data MODEL lives in
 * `server/api/events.post.ts` (api layer). Seeded coordinators come from
 * the user-service mock (`mockUserDb`).
 */

export interface AssignmentRecord {
  requestId: string
  coordinatorId: string
  assignedById: string
  assignedAt: string
  revokedAt: string | null
}

const requests = new Map<string, EventRequestRecord>()
const assignments: AssignmentRecord[] = [
  // Seed assignments so seeded submitted/approved records show coordinators.
  { requestId: 'e2', coordinatorId: 'u-coordinator', assignedById: 'system', assignedAt: '2026-09-10T09:00:00.000Z', revokedAt: null },
  { requestId: 'e3', coordinatorId: 'u-coordinator', assignedById: 'system', assignedAt: '2026-09-12T09:00:00.000Z', revokedAt: null },
  { requestId: 'e4', coordinatorId: 'u-coordinator', assignedById: 'system', assignedAt: '2026-09-15T09:00:00.000Z', revokedAt: null },
  { requestId: 'e5', coordinatorId: 'u-coordinator', assignedById: 'system', assignedAt: '2026-09-16T09:00:00.000Z', revokedAt: null },
]

function now() {
  return new Date().toISOString()
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

/** Field-keyed validation shared by POST and PUT. Null = valid. */
export function validateRequestForm(body: EventRequestForm): Record<string, string> | null {
  const errors: Record<string, string> = {}
  if (!asText(body.eventName))
    errors.eventName = 'Event name is required.'
  if (!asText(body.proposedDate) || Number.isNaN(Date.parse(asText(body.proposedDate))))
    errors.proposedDate = 'A valid proposed date is required.'
  if (typeof body.expectedAttendance !== 'number' || body.expectedAttendance <= 0)
    errors.expectedAttendance = 'Expected attendance must be a positive number.'
  if (!asText(body.startTime))
    errors.startTime = 'Start time is required.'
  if (!asText(body.endTime))
    errors.endTime = 'End time is required.'
  if (!asText(body.timeZone))
    errors.timeZone = 'Time zone is required.'
  if (!asText(body.venueType))
    errors.venueType = 'Venue type is required.'
  return Object.keys(errors).length > 0 ? errors : null
}

export function toRecordFields(body: EventRequestForm) {
  return {
    eventName: asText(body.eventName),
    purpose: asText(body.purpose),
    description: asText(body.description),
    proposedDate: asText(body.proposedDate),
    expectedAttendance: typeof body.expectedAttendance === 'number' ? body.expectedAttendance : 0,
    startTime: asText(body.startTime),
    endTime: asText(body.endTime),
    timeZone: asText(body.timeZone),
    minimumCapacity: asNumberOrNull(body.minimumCapacity),
    preferredLayout: asText(body.preferredLayout),
    venueType: asText(body.venueType),
    venueRequirements: asText(body.venueRequirements),
    accessibilityNeeds: asStringArray(body.accessibilityNeeds),
    accessibilityDetails: asText(body.accessibilityDetails),
    equipmentNeeds: asStringArray(body.equipmentNeeds),
    technicalDetails: asText(body.technicalDetails),
  }
}

/** Stub standing in for the documented load/availability rule: first eligible coordinator. */
export function pickCoordinatorId(): string | null {
  return MOCK_USERS.find(user => user.role === 'EVENT_COORDINATOR')?.id ?? null
}

export function createRequestRecord(input: { organiserId: string, status: 'DRAFT' | 'SUBMITTED', fields: ReturnType<typeof toRecordFields> }): EventRequestRecord {
  const timestamp = now()
  const record: EventRequestRecord = {
    id: `req-${Math.random().toString(36).slice(2, 10)}`,
    organiserId: input.organiserId,
    status: input.status,
    submittedAt: input.status === 'SUBMITTED' ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    coordinatorId: null,
    ...input.fields,
  }
  requests.set(record.id, record)
  if (input.status === 'SUBMITTED')
    assignCoordinator(record.id, input.organiserId)
  return record
}

/** Records (or re-records) the single current coordinator; revokes the former. */
export function assignCoordinator(requestId: string, assignedById: string): AssignmentRecord | null {
  const record = requests.get(requestId)
  if (!record)
    return null
  const coordinatorId = pickCoordinatorId()
  if (!coordinatorId)
    return null
  for (const assignment of assignments) {
    if (assignment.requestId === requestId && !assignment.revokedAt)
      assignment.revokedAt = now()
  }
  const assignment: AssignmentRecord = {
    requestId,
    coordinatorId,
    assignedById,
    assignedAt: now(),
    revokedAt: null,
  }
  assignments.push(assignment)
  record.coordinatorId = coordinatorId
  record.updatedAt = now()
  return assignment
}

export function currentCoordinatorId(requestId: string): string | null {
  return assignments.find(a => a.requestId === requestId && !a.revokedAt)?.coordinatorId ?? null
}

export function getRequestRecord(id: string): EventRequestRecord | undefined {
  let record = requests.get(id)
  if (!record) {
    // Bridge: dashboard seed rows live in the mock source. Materialize them
    // on first read (full data) so every listed card opens with prepopulated
    // fields. Owner is the seed organiser (u-organiser); anyone else gets 403.
    const seed = SEED_REQUESTS.find(entry => entry.id === id)
    if (!seed)
      return undefined
    record = { ...seed }
    requests.set(record.id, record)
  }
  record.coordinatorId = currentCoordinatorId(id)
  return record
}

/** Dashboard source: seeds overlaid with live writes, plus created records. */
export function listRequestRecords(): EventRequestRecord[] {
  const listed: EventRequestRecord[] = SEED_REQUESTS.map((seed) => {
    const live = requests.get(seed.id)
    const { category: _category, ...merged } = { ...seed, ...live }
    return { ...merged, coordinatorId: currentCoordinatorId(seed.id) }
  })
  for (const [id, record] of requests) {
    if (!SEED_REQUESTS.some(seed => seed.id === id))
      listed.push({ ...record, coordinatorId: currentCoordinatorId(id) })
  }
  return listed
}

export function updateRequestRecord(id: string, patch: Partial<EventRequestRecord> & { status?: RequestStatus }): EventRequestRecord | undefined {
  const record = requests.get(id)
  if (!record)
    return undefined
  Object.assign(record, patch, { updatedAt: now() })
  record.coordinatorId = currentCoordinatorId(id)
  return record
}
