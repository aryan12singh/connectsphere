import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (![session.user?.role,...(session.user?.roles||[])].some(role=>['EVENT_COORDINATOR','TECHNICAL_SUPPORT_STAFF'].includes(String(role))))
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view technical requirements.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  return await kongBffFetch(event, `/event-requests/${encodeURIComponent(id)}/technical-request`)
})
