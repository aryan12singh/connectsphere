import { getQuery } from 'h3'
import { kongBffFetch } from '../utils/kongBff'

export interface LeadQueueItem {
  id: string
  version: number
  eventName: string
  status: string
  submittedAt: string | null
  startAt: string | null
  endAt: string | null
  timeZone: string
  expectedAttendance: number | null
  purpose: string
  venueType: string | null
  coordinatorId: string | null
  organiser: { name: string, company: string }
  allowedActions: string[]
}

/**
 * BFF for the Coordinator Lead's queues (CS-81, CS-30). `view=unassigned`
 * (default) lists submitted requests nobody holds yet, oldest first;
 * `view=assigned` lists open requests this Lead assigned, so they can be
 * reassigned. The event service enforces Lead-only access and ordering; this
 * route only adapts the payload.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const view = query.view === 'assigned' ? 'assigned' : 'unassigned'
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const response = await kongBffFetch<{ items?: Array<Record<string, unknown>>, page?: number, pageSize?: number, total?: number }>(
    event,
    view === 'assigned' ? '/event-requests/assigned-by-me' : '/event-requests/unassigned',
    { query: { page, pageSize } },
  )
  const items: LeadQueueItem[] = (response.items ?? []).map((item) => {
    const organiser = (item.organiser ?? {}) as { name?: string, company?: string }
    return {
      id: String(item.id),
      version: Number(item.version),
      eventName: String(item.eventName ?? ''),
      status: String(item.status ?? ''),
      submittedAt: typeof item.submittedAt === 'string' ? item.submittedAt : null,
      startAt: typeof item.startAt === 'string' ? item.startAt : null,
      endAt: typeof item.endAt === 'string' ? item.endAt : null,
      timeZone: String(item.timeZone ?? ''),
      expectedAttendance: typeof item.expectedAttendance === 'number' ? item.expectedAttendance : null,
      purpose: String(item.purpose ?? ''),
      venueType: typeof item.venueType === 'string' ? item.venueType : null,
      coordinatorId: typeof item.currentCoordinatorId === 'string' ? item.currentCoordinatorId : null,
      organiser: { name: organiser.name ?? '', company: organiser.company ?? '' },
      allowedActions: Array.isArray(item.allowedActions) ? item.allowedActions.filter((a): a is string => typeof a === 'string') : [],
    }
  })
  return { view, items, page: response.page ?? page, pageSize: response.pageSize ?? pageSize, total: response.total ?? items.length }
})
