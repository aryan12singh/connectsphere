import type { EventRequestForm, EventRequestRecord } from '../api/events.post'
import type { OrganiserEvent } from '../api/events.get'

type BackendEventRequest = Record<string, unknown> & {
  id?: string
  status?: string
  organiserId?: string
  currentCoordinatorId?: string | null
  startAt?: string | null
  endAt?: string | null
  eventName?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function zoneParts(instant: unknown, timeZone: string): { date: string, time: string } {
  if (typeof instant !== 'string' || !instant)
    return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

function offsetForTimeZone(timeZone: string): string {
  if (!timeZone)
    return '+00:00'
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC')
    return 'Z'
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(now)
  const offset = parts.find(part => part.type === 'timeZoneName')?.value?.replace('GMT', '')
  return offset && /^[-+]\d{2}:\d{2}$/.test(offset) ? offset : '+08:00'
}

function combineDateTime(date: unknown, time: unknown, timeZone: string): string | undefined {
  const dateText = asString(date)
  const timeText = asString(time)
  if (!dateText || !timeText)
    return undefined
  return `${dateText}T${timeText.length === 5 ? `${timeText}:00` : timeText}${offsetForTimeZone(timeZone)}`
}

/** Convert the UI's date/time fields to the event-service ISO contract. */
export function toEventServiceInput(body: EventRequestForm & { version?: unknown }): Record<string, unknown> {
  const timeZone = asString(body.timeZone)
  return {
    eventName: asString(body.eventName),
    purpose: asString(body.purpose) || null,
    description: asString(body.description) || null,
    startAt: combineDateTime(body.proposedDate, body.startTime, timeZone) ?? null,
    endAt: combineDateTime(body.proposedDate, body.endTime, timeZone) ?? null,
    timeZone: timeZone || null,
    expectedAttendance: asNumberOrNull(body.expectedAttendance),
    minimumCapacity: asNumberOrNull(body.minimumCapacity),
    preferredLayout: asString(body.preferredLayout) || null,
    venueType: asString(body.venueType) || null,
    venueRequirements: asString(body.venueRequirements) || null,
    accessibilityNeeds: asStringArray(body.accessibilityNeeds),
    accessibilityDetails: asString(body.accessibilityDetails) || null,
    equipmentNeeds: asStringArray(body.equipmentNeeds),
    technicalDetails: asString(body.technicalDetails) || null,
    ...(typeof body.version === 'number' ? { version: body.version } : {}),
  }
}

export function fromEventServiceRequest(source: BackendEventRequest): EventRequestRecord {
  const timeZone = asString(source.timeZone) || 'UTC'
  const start = zoneParts(source.startAt, timeZone)
  const end = zoneParts(source.endAt, timeZone)
  return {
    id: asString(source.id),
    organiserId: asString(source.organiserId),
    status: (asString(source.status) || 'DRAFT') as EventRequestRecord['status'],
    submittedAt: typeof source.submittedAt === 'string' ? source.submittedAt : null,
    createdAt: asString(source.createdAt),
    updatedAt: asString(source.updatedAt),
    coordinatorId: typeof source.currentCoordinatorId === 'string' ? source.currentCoordinatorId : null,
    reviewedById: typeof source.decidedById === 'string' ? source.decidedById : null,
    reviewedAt: typeof source.decidedAt === 'string' ? source.decidedAt : null,
    decisionNotes: asString(source.decisionReason),
    eventName: asString(source.eventName),
    purpose: asString(source.purpose),
    description: asString(source.description),
    proposedDate: start.date,
    expectedAttendance: asNumberOrNull(source.expectedAttendance) ?? 0,
    startTime: start.time,
    endTime: end.time,
    timeZone,
    minimumCapacity: asNumberOrNull(source.minimumCapacity),
    preferredLayout: asString(source.preferredLayout),
    venueType: asString(source.venueType),
    venueRequirements: asString(source.venueRequirements),
    accessibilityNeeds: asStringArray(source.accessibilityNeeds),
    accessibilityDetails: asString(source.accessibilityDetails),
    equipmentNeeds: asStringArray(source.equipmentNeeds),
    technicalDetails: asString(source.technicalDetails),
  }
}

export function toOrganiserEvent(source: BackendEventRequest): OrganiserEvent {
  const record = fromEventServiceRequest({
    ...source,
    eventName: asString(source.eventName) || asString(source.title),
  })
  const date = record.proposedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${record.proposedDate}T00:00:00`)) : 'Date TBC'
  const meta = `${date}${record.startTime ? `, ${record.startTime}` : ''} · ${record.venueRequirements || record.venueType || 'Venue TBC'} · ${record.expectedAttendance > 0 ? `${record.expectedAttendance} capacity` : 'Capacity TBC'}`
  return {
    id: record.id,
    category: record.venueType ? record.venueType.toUpperCase() : 'CUSTOM EVENT',
    title: record.eventName,
    meta,
    status: record.status,
  }
}

export function toQueueItem(source: BackendEventRequest) {
  const record = fromEventServiceRequest(source)
  return {
    ...record,
    id: record.id,
    title: record.eventName,
    status: record.status,
    allowedActions: Array.isArray(source.allowedActions) ? source.allowedActions.filter((item): item is string => typeof item === 'string') : [],
    organiser: (source.organiser as { name?: string, company?: string } | undefined) ?? { name: record.organiserId, company: '' },
  }
}
