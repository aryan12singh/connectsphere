import { getMethod,readBody } from 'h3'
import { idempotencyHeaders,kongBffFetch,pathSegments } from '../../utils/kongBff'
export default defineEventHandler(async event=>{
 const parts=pathSegments(event),method=getMethod(event)
 let target:string|undefined
 const id=(value:string|undefined)=>typeof value==='string'&&/^[-\w]{1,100}$/.test(value)
 if(parts[0]==='events'&&id(parts[1])){
  const base=`/events/${encodeURIComponent(parts[1]!)}`
  if(parts.length===2&&method==='GET')target=base+'/safety'
  if(parts.length===3&&parts[2]==='preparation'&&method==='GET')target=base+'/preparation'
  if(parts.length===3&&method==='POST'){
   if(['submit','rework-review'].includes(parts[2]!))target=base+'/safety/'+parts[2]
   else if(['confirm','preparation','preparation-updates','planning-correction','venue-change-reviews'].includes(parts[2]!))target=base+'/'+parts[2]
  }
 }
 if(parts[0]==='preparation'&&parts.length===1&&method==='GET')target='/preparation-work'
 if(parts[0]==='rounds'){
  if(parts.length===1&&method==='GET')target='/safety-checks'
  if(id(parts[1])){
   if(parts.length===2&&method==='GET')target='/safety-checks/'+encodeURIComponent(parts[1]!)
   if(parts.length===3&&parts[2]==='decision'&&method==='POST')target='/safety-checks/'+encodeURIComponent(parts[1]!)+ '/decision'
  }
 }
 if(!target)throw createError({statusCode:404,statusMessage:'Safety action not found'})
 return kongBffFetch(event,target,method==='POST'?{method:'POST',body:await readBody(event),headers:idempotencyHeaders(event)}:{})
})
