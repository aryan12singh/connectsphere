import { kongBffFetch, segmentPath } from '../../../../utils/kongBff'

/** CS-30: the assigned Coordinator asks the Lead to reassign. The event service owns the rules. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Event request id is required' })
  const body = await readBody<Record<string, unknown>>(event)
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/transfer-request`, { method: 'POST', body })
})
