export type EventStatus
  = | 'draft'
    | 'submitted'
    | 'under-review'
    | 'confirmed'
    | 'planning'
    | 'completed'
    | 'rejected'

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

export const EVENT_STATUSES: EventStatus[] = [
  'draft',
  'submitted',
  'under-review',
  'confirmed',
  'planning',
  'completed',
  'rejected',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Runtime contract guard — true for any well-formed event, mock or production. */
export function isOrganiserEvent(value: unknown): value is OrganiserEvent {
  if (!isRecord(value))
    return false
  return typeof value.id === 'string'
    && typeof value.category === 'string'
    && typeof value.title === 'string'
    && typeof value.meta === 'string'
    && EVENT_STATUSES.includes(value.status as EventStatus)
}

/** Runtime contract guard for the BFF events payload. */
export function isEventsResponse(value: unknown): value is EventsResponse {
  return isRecord(value)
    && Array.isArray(value.events)
    && value.events.every(isOrganiserEvent)
}

/**
 * Modular frontend client for the BFF events route.
 * The BFF (`server/api/events.get.ts`) returns mock data for now;
 * swap the route implementation later without touching callers.
 * `fetcher` is injectable so the client stays unit-testable.
 */
export async function fetchEvents(
  fetcher: typeof $fetch = $fetch,
): Promise<EventsResponse> {
  return await fetcher<EventsResponse>('/api/events')
}
