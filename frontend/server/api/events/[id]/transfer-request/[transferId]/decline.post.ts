import { kongBffFetch, segmentPath } from '../../../../../utils/kongBff'

/** CS-30: the Lead declines a transfer request with a reason. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const transferId = getRouterParam(event, 'transferId')
  if (!id || !transferId)
    throw createError({ statusCode: 400, statusMessage: 'Request id and transfer id are required' })
  const body = await readBody<Record<string, unknown>>(event)
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id, 'transfer-request', transferId])}/decline`, { method: 'POST', body })
})
