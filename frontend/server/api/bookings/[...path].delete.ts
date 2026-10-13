import { kongBffFetch, pathSegments, segmentPath } from '../../utils/kongBff'

// Booking history is retained. Forward to the authoritative service denial
// so callers receive the same authentication, access and protected-method result.
export default defineEventHandler(async event => {
  const segments = pathSegments(event)
  if (segments.length !== 1)
    throw createError({ statusCode: 404, statusMessage: 'Booking endpoint not found' })
  return kongBffFetch(event, `/venue-bookings/${segmentPath(segments)}`, { method: 'DELETE' })
})
