import { kongBffFetch, pathSegments, segmentPath } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const segments = pathSegments(event)
  if (segments.length < 1)
    throw createError({ statusCode: 404, statusMessage: 'Venue endpoint not found' })
  if (segments.length === 2 && segments[1] === 'history')
    throw createError({ statusCode: 404, statusMessage: 'Use /api/venues/:venueId/history/combined for aggregated history' })
  return await kongBffFetch(event, `/venues/${segmentPath(segments)}`, { query: getQuery(event) })
})
