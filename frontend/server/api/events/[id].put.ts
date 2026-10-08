import { fromEventServiceRequest, toEventServiceInput } from '../../utils/eventAdapter'
import { idempotencyHeaders, kongBffFetch, segmentPath } from '../../utils/kongBff'
import { randomUUID } from 'node:crypto'
import type { EventRequestForm } from '../events.post'

/**
 * BFF for PUT /api/events/:id. The UI's `submit` flag is translated into the
 * service's separate submit command after a successful versioned update.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<EventRequestForm & { submit?: unknown, version?: unknown }>(event)
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const current = typeof body.version === 'number'
    ? null
    : await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`)
  const input = toEventServiceInput({ ...body, version: typeof body.version === 'number' ? body.version : current?.version } as EventRequestForm & { version?: unknown })
  const updated = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`, { method: 'PUT', body: input, headers })
  if (body.submit === true) {
    const submitted = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/submit`, { method: 'POST', body: { version: updated.version }, headers })
    return fromEventServiceRequest(submitted)
  }
  return fromEventServiceRequest(updated)
})
