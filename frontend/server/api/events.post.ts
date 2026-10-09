import { getHeader, getRequestURL, setResponseStatus } from 'h3'
import { idempotencyHeaders, kongBffFetch } from '../utils/kongBff'
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
  registrationEnabled?: unknown
  registrationOpensAt?: unknown
  registrationClosesAt?: unknown
}

export interface EventRequestRecord {
  id: string
  version: number
  organiserId: string
  status: RequestStatus
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  coordinatorId: string | null
  currentCoordinatorId: string | null
  eventId: string | null
  eventStatus: string | null
  statusLabel: string
  startAt: string | null
  endAt: string | null
  revisedAt?: string | null
  decisionReason?: string | null
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
  registrationEnabled: boolean
  registrationOpensAt: string
  registrationClosesAt: string
}

/**
 * BFF for POST /api/events. The UI keeps its existing save/submit contract;
 * this route translates the UI's save intent to event-service's atomic create.
 */
export default defineEventHandler(async (event) => {
  const origin = getHeader(event, 'origin')
  if (origin) {
    try {
      if (new URL(origin).origin !== getRequestURL(event).origin)
        throw createError({ statusCode: 403, statusMessage: 'Cross-origin request denied' })
    }
    catch (error) {
      if ((error as { statusCode?: number }).statusCode === 403) throw error
      throw createError({ statusCode: 403, statusMessage: 'Cross-origin request denied' })
    }
  }
  const body = await readBody<EventRequestForm & { saveAs?: unknown }>(event)
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const input = toEventServiceInput(body)
  // Existing clients treat POST as submission unless they explicitly choose
  // the Draft action. This preserves sparse private drafts while ensuring an
  // ordinary/incomplete POST is validated as a submission.
  if (body.saveAs !== 'draft') input.saveAs = 'submit'
  const created = await kongBffFetch<Record<string, unknown>>(event, '/event-requests', { method: 'POST', body: input, headers })
  setResponseStatus(event, 201)
  return fromEventServiceRequest(created)
})
