import {getMethod,readBody} from 'h3'
import {idempotencyHeaders,kongBffFetch,pathSegments} from '../../utils/kongBff'
export default defineEventHandler(async event=>{
 const session=await requireUserSession(event)
 if(![session.user?.role,...(session.user?.roles||[])].includes('TECHNICAL_SUPPORT_STAFF'))throw createError({statusCode:403,statusMessage:'Technical Support permission required'})
 const parts=pathSegments(event),method=getMethod(event)
 let target:string|undefined
 if(parts[0]==='inventory'&&parts.length===1&&method==='GET')target='/equipment-inventory'
 if(parts[0]==='inventory'&&parts.length===2&&method==='PUT'&&/^[-\w]{1,100}$/.test(parts[1]!))target='/equipment-inventory/'+encodeURIComponent(parts[1]!)
 if(parts[0]==='operations'&&parts.length===1&&method==='POST')target='/equipment-operational-unavailability'
 if(parts[0]==='requests'&&parts[2]==='availability'&&parts.length===3&&method==='GET'&&/^[-\w]{1,100}$/.test(parts[1]!))target='/event-requests/'+encodeURIComponent(parts[1]!)+'/technical-request/availability'
 if(parts[0]==='requests'&&parts[2]==='reserve'&&parts.length===3&&method==='POST'&&/^[-\w]{1,100}$/.test(parts[1]!))target='/event-requests/'+encodeURIComponent(parts[1]!)+'/technical-request/reservations'
 if(!target)throw createError({statusCode:404,statusMessage:'Equipment action not found'})
 return kongBffFetch(event,target,method==='GET'?{}:{method:method as 'POST'|'PUT',body:await readBody(event),headers:idempotencyHeaders(event)})
})
