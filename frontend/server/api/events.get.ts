// Explicit import (Nuxt also auto-imports it) so the CS-10/CS-30 tests, which
// run this handler outside Nuxt, can call it.
import { getQuery } from 'h3'
import { createEventsResponse } from '../utils/eventMocks'
import { listRequestRecords } from '../utils/eventRequestStore'

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
 * BFF for GET /api/events. Organiser requests are read from event-service's
 * request endpoint; booking selectors use the event endpoint exposed through
 * Kong so the browser never talks to a service directly.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown, role?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  if (query.scope === 'booking') {
    // Event options for the booking form. Only Event Coordinators create
    // venue bookings (2026-10-07), so only they get any; Venue Staff change
    // booking status and do not need the event list.
    if (user.role !== 'EVENT_COORDINATOR')
      return { events: [] }

    // Coordinator booking options remain assignment-scoped.
    return createEventsResponse(listRequestRecords().filter(record => record.coordinatorId === user.id))
  }

  if (user.role !== 'EVENT_ORGANISER')
    return { events: [] }
  const response = await kongBffFetch<{ items?: unknown[] }>(event, '/event-requests', { query: { scope: 'own', page: 1, pageSize: 100 } })
  return { events: (response.items ?? []).map(item => toOrganiserEvent(item as Record<string, unknown>)) }
})
