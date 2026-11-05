import { getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

const statusOf = (error: unknown) => Number((error as { statusCode?: number } | null)?.statusCode)

async function eventIsMissing(event: H3Event, id: string) {
  try {
    await kongBffFetch(event, `/event-requests/${encodeURIComponent(id)}`)
    return false
  }
  catch (error) {
    return [403, 404].includes(statusOf(error))
  }
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!['EVENT_COORDINATOR', 'TECHNICAL_SUPPORT_STAFF', 'SAFETY_OFFICER'].includes(String(session.user?.role)))
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view technical requirements.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event request ID is required.' })
  let result: Record<string, any>
  try {
    result = await kongBffFetch<Record<string, any>>(event, `/event-requests/${encodeURIComponent(id)}/technical-request`)
  }
  catch (error) {
    // CS-95: for the Coordinator a missing technical request normally means "start one", but only
    // for an Event they can open. A mistyped or unknown ID gets a not-found answer instead.
    if (statusOf(error) === 404 && session.user?.role === 'EVENT_COORDINATOR' && await eventIsMissing(event, id))
      throw createError({ statusCode: 404, statusMessage: 'Event not found.', data: { error: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' } } })
    throw error
  }
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
