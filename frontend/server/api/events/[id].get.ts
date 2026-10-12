import { fromEventServiceRequest } from '../../utils/eventAdapter'
import { kongBffFetch, segmentPath } from '../../utils/kongBff'

/**
 * BFF for GET /api/events/:id — forwards request visibility decisions to
 * event-service and maps the response to the form's UI contract.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  return fromEventServiceRequest(await kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}`))
})
