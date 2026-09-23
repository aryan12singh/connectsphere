import { listRequestRecords } from '../utils/eventRequestStore'
import { MOCK_USERS } from '../utils/mockUserDb'

export interface QueueOrganiser {
  name: string
  company: string
}

export interface QueueItem {
  id: string
  title: string
  status: 'SUBMITTED'
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
}

/**
 * BFF mock for GET /api/review-queue — coordinator-only work queue of
 * submitted requests awaiting review, each with its organiser contact.
 * Organisers (and everyone else) get 403; the organiser dashboard owns them.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown, role?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (user.role !== 'EVENT_COORDINATOR')
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const requests = listRequestRecords()
    .filter(record => record.status === 'SUBMITTED')
    .map((record): QueueItem => {
      const organiser = MOCK_USERS.find(candidate => candidate.id === record.organiserId)
      return {
        ...record,
        status: 'SUBMITTED' as const,
        title: record.eventName,
        organiser: {
          name: organiser ? `${organiser.firstName} ${organiser.lastName}` : 'Unknown organiser',
          company: organiser?.company ?? '',
        },
      }
    })

  return { requests }
})
