import { fromEventServiceRequest, toEventServiceInput } from '../../utils/eventAdapter'
import { idempotencyHeaders, kongBffFetch, segmentPath } from '../../utils/kongBff'
import { randomUUID } from 'node:crypto'
import type { EventRequestForm } from '../events.post'

/**
 * BFF for PUT /api/events/:id. The UI's `submit` flag is translated into the
 * service's atomic submit/resubmit command so failed validation cannot persist
 * a partially edited draft.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<EventRequestForm & { action?: unknown, submit?: unknown, version?: unknown }>(event)
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const action = body.action === 'resubmit' ? 'resubmit' : body.submit === true ? 'submit' : null
  let updated: Record<string, unknown> | null = null
  if (!action) {
    const current = typeof body.version === 'number'
      ? null
      : await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`)
    const input = toEventServiceInput({ ...body, version: typeof body.version === 'number' ? body.version : current?.version } as EventRequestForm & { version?: unknown })
    updated = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`, { method: 'PUT', body: input, headers })
  }
  if (action) {
    const input = toEventServiceInput({ ...body, version: body.version } as EventRequestForm & { version?: unknown })
    const submitted = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/${action}`, { method: 'POST', body: input, headers })
    return fromEventServiceRequest(submitted)
  }
  return fromEventServiceRequest(updated!)
})
