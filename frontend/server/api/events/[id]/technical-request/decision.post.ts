import { getHeader, getRouterParam, readBody } from 'h3'
import { idempotencyHeaders, kongBffFetch } from '../../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user?.role !== 'TECHNICAL_SUPPORT_STAFF')
    throw createError({ statusCode: 403, statusMessage: 'Only Technical Support may decide technical requirements.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  const key = getHeader(event, 'idempotency-key')
  return await kongBffFetch(event, `/event-requests/${encodeURIComponent(id)}/technical-request/decision`, {
    method: 'POST', body: await readBody(event), headers: key ? idempotencyHeaders(event) : undefined,
  })
})
