import { getRequestRecord, updateRequestRecord } from '../../../utils/eventRequestStore'

const DECISIONS = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  amendments: 'RETURNED_FOR_AMENDMENT',
} as const

/**
 * BFF mock for POST /api/events/:id/decision — coordinator review decision.
 * Only SUBMITTED requests transition; anything else conflicts (409).
 * Coordinator-only; unknown ids 404; unknown decisions 422.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown, role?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (user.role !== 'EVENT_COORDINATOR')
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = getRouterParam(event, 'id')
  const record = id ? getRequestRecord(id) : undefined
  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Event request not found' })

  const body = await readBody<{ decision?: unknown, notes?: unknown }>(event)
  const next = typeof body?.decision === 'string' ? DECISIONS[body.decision as keyof typeof DECISIONS] : undefined
  if (!next)
    throw createError({ statusCode: 422, statusMessage: 'Unknown decision', data: { errors: { decision: 'Decision must be approve, reject or amendments.' } } })
  if (record.status !== 'SUBMITTED')
    throw createError({ statusCode: 409, statusMessage: 'Only submitted requests can be decided' })

  updateRequestRecord(record.id, {
    status: next,
    reviewedById: user.id,
    reviewedAt: new Date().toISOString(),
    decisionNotes: typeof body?.notes === 'string' ? body.notes : '',
  })

  return getRequestRecord(record.id)
})
