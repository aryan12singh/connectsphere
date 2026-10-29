import { kongBffFetch, segmentPath } from '../../../../utils/kongBff'

/** CS-45: change proposals for one request (Organiser or assigned Coordinator). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  return kongBffFetch<{ items: Record<string, unknown>[] }>(event, `/event-requests/${segmentPath([id])}/change-requests`)
})
