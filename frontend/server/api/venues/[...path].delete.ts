import { kongBffFetch, pathSegments, segmentPath } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const segments = pathSegments(event)
  if (segments.length !== 1)
    throw createError({ statusCode: 404, statusMessage: 'Venue delete endpoint not found' })

  await kongBffFetch(event, `/venues/${segmentPath(segments)}`, {
    method: 'DELETE',
  })
  setResponseStatus(event, 204)
  return null
})
