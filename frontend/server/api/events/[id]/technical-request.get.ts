import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!['EVENT_COORDINATOR', 'TECHNICAL_SUPPORT_STAFF', 'SAFETY_OFFICER'].includes(String(session.user?.role)))
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view technical requirements.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  const result = await kongBffFetch<Record<string, any>>(event, `/event-requests/${encodeURIComponent(id)}/technical-request`)
  if (result?.decidedById) {
    try {
      const user = await kongBffFetch<Record<string, any>>(event, `/users/${encodeURIComponent(result.decidedById)}`)
      result.decidedByName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null
    } catch {
      result.decidedByName = null
    }
  }
  // Resolve venue IDs to names
  if (result?.equipment?.length) {
    try {
      const allVenues = await kongBffFetch<{ items: Array<{ id: string, name: string }> }>(event, '/venues')
      const venueMap = new Map<string, string>()
      for (const v of allVenues.items ?? []) venueMap.set(v.id, v.name)
      result.equipment = result.equipment.map((line: any) => {
        if (line.venueId && venueMap.has(line.venueId)) {
          return { ...line, venueName: venueMap.get(line.venueId) }
        }
        return line
      })
    } catch {
      // Venue lookup failure should not block the request view
    }
  }
  return result
})
