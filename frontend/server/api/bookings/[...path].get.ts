import { kongBffFetch, pathSegments, segmentPath } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const segments = pathSegments(event)
  if (segments.length !== 1)
    throw createError({ statusCode: 404, statusMessage: 'Booking endpoint not found' })
  return await kongBffFetch(event, `/venue-bookings/${segmentPath(segments)}`, { query: getQuery(event) })
})
