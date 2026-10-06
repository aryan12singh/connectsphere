import { requestCall } from '../../utils/eventBff'
export default defineEventHandler(async(event)=>requestCall(event,`/events/${encodeURIComponent(String(getRouterParam(event,'id')))}/activity`,{query:getQuery(event)}))
