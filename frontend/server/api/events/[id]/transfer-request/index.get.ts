import { kongBffFetch, segmentPath } from '../../../../utils/kongBff'

/** CS-30: transfer requests for one request (the current Coordinator or a Lead). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  return kongBffFetch<{ items: Record<string, unknown>[] }>(event, `/event-requests/${segmentPath([id])}/transfer-request`)
})
