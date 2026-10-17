import { getHeader, getRouterParam, readBody } from 'h3'
import { idempotencyHeaders, kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!(session.user?.roles ?? [session.user?.role]).includes('EVENT_COORDINATOR'))
    throw createError({ statusCode: 403, statusMessage: 'Only the assigned Coordinator may submit technical requirements.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  const key = getHeader(event, 'idempotency-key')
  return await kongBffFetch(event, `/event-requests/${encodeURIComponent(id)}/technical-request`, {
    method: 'POST', body: await readBody(event), headers: key ? idempotencyHeaders(event) : undefined,
  })
})
