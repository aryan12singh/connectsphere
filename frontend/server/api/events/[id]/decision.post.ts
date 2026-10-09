import { fromEventServiceRequest } from '../../../utils/eventAdapter'
import { idempotencyHeaders, kongBffFetch, segmentPath } from '../../../utils/kongBff'
import { randomUUID } from 'node:crypto'

/**
 * BFF for coordinator decisions. The event service owns role, assignment,
 * status and mandatory-reason validation.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<{ decision?: unknown, notes?: unknown, reason?: unknown, comments?: unknown, version?: unknown }>(event)
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const current = typeof body.version === 'number'
    ? null
    : await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`)
  const response = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/decision`, { method: 'POST', body: { ...body, ...(typeof body.version === 'number' ? {} : { version: current?.version }) }, headers })
  return fromEventServiceRequest(response)
})
