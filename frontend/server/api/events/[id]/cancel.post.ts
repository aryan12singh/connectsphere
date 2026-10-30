import { kongBffFetch, segmentPath } from '../../../utils/kongBff'

/**
 * BFF for the assigned Coordinator's direct cancellation (CS-54). The Event
 * becomes Cancelling; the event service owns who may do it and until when.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<Record<string, unknown>>(event)
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/cancel`, { method: 'POST', body })
})
