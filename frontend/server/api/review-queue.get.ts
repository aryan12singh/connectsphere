import { getQuery } from 'h3'
import { kongBffFetch } from '../utils/kongBff'
import { toQueueItem } from '../utils/eventAdapter'

export interface QueueOrganiser {
  name: string
  company: string
}

export interface QueueItem {
  id: string
  title: string
  status: 'SUBMITTED' | 'RETURNED_FOR_AMENDMENT' | 'APPROVED' | 'REJECTED'
  submittedAt: string | null
  coordinatorId: string | null
  organiser: QueueOrganiser
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
  allowedActions?: string[]
}

/**
 * BFF for the coordinator review queue. The event service owns assignment,
 * status and organiser visibility; this route only adapts its payload.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
  const response = await kongBffFetch<{ items?: unknown[], requests?: unknown[], page?: number, pageSize?: number, total?: number }>(event, '/event-requests/review-queue', { query: { assigned: 'me', page, pageSize } })
  const requests = (response.items ?? response.requests ?? []).map(item => toQueueItem(item as Record<string, unknown>))
  return { requests, page: response.page ?? page, pageSize: response.pageSize ?? pageSize, total: response.total ?? requests.length }
})
