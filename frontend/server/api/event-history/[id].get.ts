import { kongBffFetch } from '../../utils/kongBff'
export default defineEventHandler(async(event)=>kongBffFetch(event,`/events/${encodeURIComponent(String(getRouterParam(event,'id')))}/activity`,{query:getQuery(event)}))
