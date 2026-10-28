import { fromEventServiceRequest } from '../../../utils/eventAdapter'
import { idempotencyHeaders, kongBffFetch, segmentPath } from '../../../utils/kongBff'
import { randomUUID } from 'node:crypto'

/**
 * BFF for the Coordinator Lead's "Assign". The event service decides who may
 * assign (Leads only), checks the request is queued and the target is an
 * active Coordinator; this route only forwards the choice with the request's
 * version and an Idempotency-Key.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<{ coordinatorId?: unknown, version?: unknown }>(event)
  if (typeof body?.coordinatorId !== 'string' || !body.coordinatorId)
    throw createError({ statusCode: 422, statusMessage: 'Choose a Coordinator' })
  const headers = idempotencyHeaders(event) ?? { 'Idempotency-Key': randomUUID() }
  const response = await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/assign`, {
    method: 'POST',
    body: { coordinatorId: body.coordinatorId, version: body.version },
    headers,
  })
  return fromEventServiceRequest(response)
})
