import { getQuery } from 'h3'
import { kongBffFetch } from '../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user?.role !== 'TECHNICAL_SUPPORT_STAFF')
    throw createError({ statusCode: 403, statusMessage: 'Only Technical Support may view the technical review queue.' })
  const query = getQuery(event)
  const resolved = query.includeResolved === '1' ? '?includeResolved=1' : ''
  const queue = await kongBffFetch<{ requests: Array<Record<string, any> & { eventRequestId: string, equipment?: Array<{ equipmentType: string, quantity: number, venueId?: string | null }> }> }>(event, `/technical-requests${resolved}`)
  if (!queue.requests.length) return queue

  // Collect all unique venue IDs from equipment lines across all requests
  const venueIds = new Set<string>()
  for (const request of queue.requests) {
    for (const equip of request.equipment ?? []) {
      if (equip.venueId) venueIds.add(equip.venueId)
    }
  }

  // Resolve venue IDs to names via venue service
  const venueMap = new Map<string, string>()
  if (venueIds.size > 0) {
    try {
      const allVenues = await kongBffFetch<{ items: Array<{ id: string, name: string }> }>(event, '/venues')
      for (const v of allVenues.items ?? []) {
        if (venueIds.has(v.id)) venueMap.set(v.id, v.name)
      }
    } catch {
      // Venue lookup failure should not block the review queue
    }
  }

  const ids = queue.requests.map(request => request.eventRequestId).join(',')
  const metadata = await kongBffFetch<{ items: Array<Record<string, any> & { eventRequestId: string }> }>(event, `/event-requests/technical-metadata?ids=${encodeURIComponent(ids)}`)
  const byId = new Map(metadata.items.map(item => [item.eventRequestId, item]))
  return {
    ...queue,
    requests: queue.requests.map(request => {
      const enrichedEquipment = (request.equipment ?? []).map(equip => {
        if (equip.venueId && venueMap.has(equip.venueId)) {
          return { ...equip, venueName: venueMap.get(equip.venueId) }
        }
        return equip
      })
      return { ...request, event: byId.get(request.eventRequestId) ?? null, equipment: enrichedEquipment }
    }),
  }
})
