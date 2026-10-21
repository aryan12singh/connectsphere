import { kongBffFetch, segmentPath } from '../../../utils/kongBff'
export default defineEventHandler(async(event)=>{
 const id=getRouterParam(event,'id')
 if(!id)throw createError({statusCode:400,statusMessage:'Request ID is required'})
 return kongBffFetch(event,`/event-requests/${segmentPath([id])}/activity`,{query:getQuery(event)})
})
