import { kongBffFetch, pathSegments, segmentPath } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const segments = pathSegments(event)
  if (segments.length < 1)
    throw createError({ statusCode: 404, statusMessage: 'Venue endpoint not found' })
  if (segments.length > 2 || (segments.length === 2 && segments[1] !== 'operating-hours'))
    throw createError({ statusCode: 404, statusMessage: 'Venue endpoint not found' })

  return await kongBffFetch(event, `/venues/${segmentPath(segments)}`, {
    method: 'PUT',
    body: await readBody(event),
  })
})
