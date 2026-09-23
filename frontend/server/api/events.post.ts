import { createRequestRecord, toRecordFields, validateRequestForm } from '../utils/eventRequestStore'

/**
 * Data model for POST /api/events. Owned by this route file (the api layer),
 * not the mock — the store, sibling routes and (via Nitro inference) pages
 * consume this contract. Statuses follow the backend `EventRequestStatus`
 * enum (uppercase); `NEW` never reaches the wire — it is client-only.
 */
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
 * BFF mock for POST /api/events — Save draft (`saveAs: 'draft'` → DRAFT)
 * and Submit (`saveAs: 'submit'` → SUBMITTED + coordinator assignment).
 * Protected via nuxt-auth-utils; owner is the session user.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<EventRequestForm & { saveAs?: unknown }>(event)
  const validationErrors = validateRequestForm(body)
  if (validationErrors)
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: { errors: validationErrors } })

  const status: RequestStatus = body.saveAs === 'submit' ? 'SUBMITTED' : 'DRAFT'
  // createRequestRecord auto-assigns a coordinator on SUBMITTED.
  return createRequestRecord({ organiserId: user.id, status, fields: toRecordFields(body) })
})
