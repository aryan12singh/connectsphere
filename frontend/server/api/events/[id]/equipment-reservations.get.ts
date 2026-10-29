import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (String(session.user?.role) !== 'TECHNICAL_SUPPORT_STAFF')
    throw createError({ statusCode: 403, statusMessage: 'Only Technical Support can view equipment reservation history.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  return kongBffFetch<{ reservations: Array<{ id: string, eventId: string, equipmentType: string, quantity: number, active: boolean, releasedAt: string | null, releaseReason: string | null }> }>(
    event,
    `/event-requests/${encodeURIComponent(id)}/equipment-reservations`,
  )
})
