import { requestCall, browserRecord, card } from '../utils/eventBff'

export type EventStatus
  = | 'DRAFT'
    | 'SUBMITTED'
    | 'RETURNED_FOR_AMENDMENT'
    | 'APPROVED'
    | 'REJECTED'

export interface OrganiserEvent {
  id: string
  category: string
  title: string
  meta: string
  status: EventStatus
}

export interface EventsResponse {
  events: OrganiserEvent[]
}


export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if(query.scope === 'booking') {
    const result = await requestCall<{items:{id:string,title:string,status:string}[]}>(event,'/events')
    return {events:result.items.map(item=>({...item,category:'EVENT',meta:'',status:'APPROVED' as const}))}
  }
  // Verify live identity for the dashboard even when it is the Coordinator home.
  const me = await requestCall<{user:{role:string,roles?:string[]}}>(event,'/auth/me')
  const roles = me.user.roles ?? [me.user.role]
  if(!roles.includes('EVENT_ORGANISER') && roles.includes('EVENT_COORDINATOR')) return {events:[]}
  const result = await requestCall<{items:Record<string,unknown>[]}>(event,'/event-requests',{query})
  return {events:result.items.map(item=>card(browserRecord(item)))}
})
