import { kongBffFetch,segmentPath } from '../../../../utils/kongBff'
export default defineEventHandler(async event => {
  const id=getRouterParam(event,'eventId')
  if(!id)throw createError({statusCode:400,statusMessage:'Event ID is required'})
  return kongBffFetch(event,`/venue-bookings/events/${segmentPath([id])}/primary-venue`,{method:'PUT',body:await readBody(event)})
})
