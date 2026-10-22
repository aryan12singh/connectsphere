import {kongBffFetch,idempotencyHeaders,pathSegments,segmentPath} from '../../utils/kongBff'
export default defineEventHandler(async event=>{
 const parts=pathSegments(event)
 if(!(parts.length===1&&parts[0]==='impact-preview'||parts.length===2&&['restore','replacements','resubmit'].includes(parts[1]!)))throw createError({statusCode:404,statusMessage:'Booking action not found'})
 return kongBffFetch(event,`/venue-bookings/${segmentPath(parts)}`,{method:'POST',body:await readBody(event),headers:idempotencyHeaders(event)})
})
