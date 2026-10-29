import { kongBffFetch, segmentPath } from '../../../../utils/kongBff'

/** CS-45: propose a significant change. The event service validates and owns the rules. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<Record<string, unknown>>(event)
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/change-requests`, { method: 'POST', body })
})
