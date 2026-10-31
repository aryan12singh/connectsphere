import { kongBffFetch, segmentPath } from '../../../../../utils/kongBff'

/** CS-30: the Coordinator who asked takes the request back. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const transferId = getRouterParam(event, 'transferId')
  if (!id || !transferId)
    throw createError({ statusCode: 400, statusMessage: 'Request id and transfer id are required' })
  return kongBffFetch<Record<string, unknown>>(event, `/event-requests/${segmentPath([id, 'transfer-request', transferId])}/withdraw`, { method: 'POST', body: {} })
})
