import { getQuery } from 'h3'
import { kongBffFetch } from '../utils/kongBff'
import { toOrganiserEvent } from '../utils/eventAdapter'

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
    const response = await kongBffFetch<{ items?: unknown[], events?: unknown[] }>(event, '/events', { query: { page: 1, pageSize: 100 } })
    const items = Array.isArray(response.items) ? response.items : (Array.isArray(response.events) ? response.events : [])
    return { events: items.map(item => toOrganiserEvent(item as Record<string, unknown>)) }
  }

  if (user.role !== 'EVENT_ORGANISER')
    return { events: [] }
  const response = await kongBffFetch<{ items?: unknown[] }>(event, '/event-requests', { query: { scope: 'own', page: 1, pageSize: 100 } })
  return { events: (response.items ?? []).map(item => toOrganiserEvent(item as Record<string, unknown>)) }
})
