import { kongBffFetch,segmentPath } from '../../../utils/kongBff'
export default defineEventHandler(async event => {
  const id=getRouterParam(event,'id')
  if (!id) throw createError({statusCode:400,statusMessage:'Booking ID is required'})
  return kongBffFetch(event,`/venue-bookings/${segmentPath([id])}/hold-extension`,{method:'PUT',body:await readBody(event)})
})
