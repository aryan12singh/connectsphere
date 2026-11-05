import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  // CS-42 AC3: the current Coordinator can read it too; equipment-service
  // checks that the Coordinator is the one currently assigned.
  if (!['TECHNICAL_SUPPORT_STAFF', 'EVENT_COORDINATOR'].includes(String(session.user?.role)))
    throw createError({ statusCode: 403, statusMessage: 'Only Technical Support and the assigned Coordinator can view equipment reservation history.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  return kongBffFetch<{ reservations: Array<{ id: string, eventId: string, equipmentType: string, quantity: number, startAt: string, endAt: string, active: boolean, releasedAt: string | null, releaseReason: string | null }> }>(
    event,
    `/event-requests/${encodeURIComponent(id)}/equipment-reservations`,
  )
})
