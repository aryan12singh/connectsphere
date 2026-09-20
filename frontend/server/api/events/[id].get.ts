import { getRequestRecord } from '../../utils/eventRequestStore'

/**
 * BFF mock for GET /api/events/:id — owner-only read of one request with its
 * current coordinator (CS-30 organiser view). Non-owners 403 without contents.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const user = session.user as { id?: unknown } | undefined
  if (!user || typeof user.id !== 'string')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = getRouterParam(event, 'id')
  const record = id ? getRequestRecord(id) : undefined
  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Event request not found' })
  if (record.organiserId !== user.id)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  return record
})
