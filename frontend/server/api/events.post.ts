import { idempotencyHeaders, kongBffFetch, segmentPath } from '../utils/kongBff'
import { fromEventServiceRequest, toEventServiceInput } from '../utils/eventAdapter'
import { randomUUID } from 'node:crypto'

export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED_FOR_AMENDMENT' | 'APPROVED' | 'REJECTED'

export interface EventRequestForm {
  eventName: unknown
  purpose: unknown
  description: unknown
  proposedDate: unknown
  expectedAttendance: unknown
  startTime: unknown
  endTime: unknown
  timeZone: unknown
  minimumCapacity: unknown
  preferredLayout: unknown
  venueType: unknown
  venueRequirements: unknown
  accessibilityNeeds: unknown
  accessibilityDetails: unknown
  equipmentNeeds: unknown
  technicalDetails: unknown
}

export interface EventRequestRecord {
  id: string
  organiserId: string
  status: RequestStatus
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  coordinatorId: string | null
  reviewedById?: string | null
  reviewedAt?: string | null
  decisionNotes?: string
  eventName: string
  purpose: string
  description: string
  proposedDate: string
  expectedAttendance: number
  startTime: string
  endTime: string
  timeZone: string
  minimumCapacity: number | null
  preferredLayout: string
  venueType: string
  venueRequirements: string
  accessibilityNeeds: string[]
  accessibilityDetails: string
  equipmentNeeds: string[]
  technicalDetails: string
}

/**
 * BFF for POST /api/events. The UI keeps its existing save/submit contract;
 * this route translates it to event-service's create + submit endpoints.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<EventRequestForm & { saveAs?: unknown }>(event)
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const created = await kongBffFetch<Record<string, unknown>>(event, '/event-requests', { method: 'POST', body: toEventServiceInput(body), headers })
  if (body.saveAs === 'submit') {
    const submitted = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([String(created.id)])}/submit`, {
      method: 'POST',
      body: { version: created.version },
      headers,
    })
    return fromEventServiceRequest(submitted)
  }
  return fromEventServiceRequest(created)
})
