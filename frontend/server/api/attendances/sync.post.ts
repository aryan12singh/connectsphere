import { kongBffFetch } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (session.user.role !== 'EVENT_ORGANISER' && session.user.role !== 'TECHNICAL_SUPPORT_STAFF')
    throw createError({ statusCode: 403, statusMessage: 'Only organisers or staff can sync events.' })

  // Fetch confirmed events from event-service
  const events = await kongBffFetch<{ events?: any[] }>(event, '/events', {
    query: { scope: 'booking', page: 1, pageSize: 100 }
  })
  const items = Array.isArray(events?.events) ? events.events : []

  // Sync each confirmed event to attendance-service
  const synced = []
  for (const item of items) {
    if (item.status !== 'APPROVED') continue
    try {
      const attendanceEvent = {
        id: item.eventId || item.id,
        eventId: item.eventId || item.id,
        title: item.eventName || item.title,
        description: item.eventName || item.title,
        status: 'CONFIRMED',
        startAt: item.startAt,
        endAt: item.endAt,
        timeZone: item.timeZone || 'Asia/Singapore',
        primaryVenueId: item.primaryVenueId,
        primaryVenueName: item.primaryVenueName,
        registrationLimit: item.registrationLimit,
        registrationWindow: item.registrationWindow,
        organiserId: item.organiserId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        venues: item.venues || [],
      }
      const result = await kongBffFetch(event, '/attendances/events', {
        method: 'POST',
        body: attendanceEvent
      })
      synced.push(result)
    }
    catch {
      // Skip events that fail to sync
    }
  }

  return { synced: synced.length, events: synced }
})
