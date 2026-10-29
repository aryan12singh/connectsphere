import { kongBffFetch, segmentPath } from '../../../../../utils/kongBff'

/** CS-45: the assigned Coordinator approves or rejects a proposed change. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id'), changeId = getRouterParam(event, 'changeId')
  if (!id || !changeId)
    throw createError({ statusCode: 400, statusMessage: 'Event request id and change id are required' })
  const body = await readBody<Record<string, unknown>>(event)
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id])}/change-requests/${segmentPath([changeId])}/decision`, { method: 'POST', body })
})
