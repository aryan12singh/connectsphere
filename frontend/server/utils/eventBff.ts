import { getRouterParam, getHeader, getRequestURL, readBody, createError, type H3Event } from 'h3'
import { kongBffFetch } from './kongBff'
export function requestCall<T = Record<string, unknown>>(event:H3Event,path:string,options:Parameters<typeof kongBffFetch>[2]={}):Promise<T> {
 return kongBffFetch<T>(event,path,options)
}
export function requestPath(event:H3Event) {
 const id=getRouterParam(event,'id');if(!id)throw createError({statusCode:400,statusMessage:'Request ID is required'})
 return `/event-requests/${encodeURIComponent(id)}`
}
export async function writeOptions(event:H3Event) {
 const origin=getHeader(event,'origin')
 if(origin && origin!==getRequestURL(event).origin)throw createError({statusCode:403,statusMessage:'Cross-origin writes are not allowed'})
 const body=await readBody<Record<string,unknown>>(event)
 if(!body || typeof body!=='object' || Array.isArray(body))throw createError({statusCode:400,statusMessage:'A JSON object is required'})
 const key=getHeader(event,'idempotency-key') ?? (typeof body.operationKey==='string'?body.operationKey:undefined)
 if(!key)throw createError({statusCode:400,statusMessage:'An operation key is required'})
 const payload={...body};delete payload.operationKey
 return {body:payload,headers:{'Idempotency-Key':key}}
}
export function browserRecord(record:Record<string,unknown>) {
 return {...record,coordinatorId:record.currentCoordinatorId ?? null} as Record<string,unknown> & {id:string,status:'DRAFT'|'SUBMITTED'|'RETURNED_FOR_AMENDMENT'|'APPROVED'|'REJECTED',version:number,coordinatorId:string|null,eventName:string}
}
export function card(record:ReturnType<typeof browserRecord>) {
 const date=typeof record.proposedDate==='string'?record.proposedDate:'Date TBC'
 const clock=typeof record.startTime==='string'?record.startTime:''
 return {id:record.id,title:record.eventName || 'Untitled draft',status:record.status,statusLabel:record.statusLabel,category:'EVENT REQUEST',meta:`${date}${clock?' · '+clock:''} · ${record.expectedAttendance??'Attendance TBC'}`}
}
