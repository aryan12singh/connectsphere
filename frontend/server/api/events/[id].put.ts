import { assignCoordinator, getRequestRecord, toRecordFields, updateRequestRecord, validateRequestForm } from '../../utils/eventRequestStore'
import type { EventRequestForm } from '../events.post'

/**
 * BFF mock for PUT /api/events/:id — draft edit-save (stays DRAFT) and
 * draft submit (`submit: true` → SUBMITTED + coordinator assignment).
 * Owner-only; submitted records stay SUBMITTED on edit-save (read-only
 * outside the explicit edit flow); unknown ids 404.
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

  const body = await readBody<EventRequestForm & { submit?: unknown }>(event)
  const validationErrors = validateRequestForm(body)
  if (validationErrors)
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: { errors: validationErrors } })

  const submitting = record.status === 'DRAFT' && body.submit === true
  updateRequestRecord(record.id, {
    ...toRecordFields(body),
    status: submitting ? 'SUBMITTED' : record.status,
    submittedAt: submitting ? new Date().toISOString() : record.submittedAt,
  })
  if (submitting)
    assignCoordinator(record.id, user.id)

  return getRequestRecord(record.id)
})
