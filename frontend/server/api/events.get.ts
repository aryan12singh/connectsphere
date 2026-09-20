import { createEventsResponse } from '../utils/eventMocks'

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
 * Protected server-side via nuxt-auth-utils: 401 without a sealed session.
 * Returns deterministic mock data so the frontend can be built
 * against a stable contract before the real events service lands.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return createEventsResponse()
})
