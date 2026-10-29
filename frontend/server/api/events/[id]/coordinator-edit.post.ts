import { fromEventServiceRequest } from '../../../utils/eventAdapter'
import { idempotencyHeaders, kongBffFetch, segmentPath } from '../../../utils/kongBff'
import { randomUUID } from 'node:crypto'

/**
 * BFF for the assigned Coordinator's routine edit (CS-43). The event service
 * owns who may edit, which fields are routine, and the change history.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<Record<string, unknown>>(event)
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const response = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/coordinator-edit`, { method: 'POST', body, headers })
  return fromEventServiceRequest(response)
})
