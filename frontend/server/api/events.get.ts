import { createEventsResponse } from '../utils/eventMocks'
import { listRequestRecords } from '../utils/eventRequestStore'

/**
 * Data model for GET /api/events. Owned by this route file (the api layer),
 * not the mock — mocks and (via Nitro inference) pages consume this contract.
 * Status values follow the backend `EventRequestStatus` enum plus `DRAFT`;
 * `NEW` never reaches the wire — it is client-only (fresh unsaved form).
 */
export type EventStatus
  = | 'DRAFT'
    | 'SUBMITTED'
    | 'RETURNED_FOR_AMENDMENT'
    | 'APPROVED'
    | 'REJECTED'

export interface OrganiserEvent {
  id: string
  category: string
  title: string
  meta: string
  status: EventStatus
}

export interface EventsResponse {
  events: OrganiserEvent[]
}

/**
 * BFF mock for GET /api/events.
 * Organiser-owner-scoped: organisers see only their own records; every other
 * role gets an empty list (coordinators work from /api/review-queue).
 * Protected server-side via nuxt-auth-utils: 401 without a sealed session.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown, role?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (user.role !== 'EVENT_ORGANISER')
    return { events: [] }
  return createEventsResponse(listRequestRecords().filter(record => record.organiserId === user.id))
})
