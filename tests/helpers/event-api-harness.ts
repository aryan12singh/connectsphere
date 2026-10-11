// Real H3 handlers -> HTTP dependency boundary -> real Express/Prisma/PostgreSQL.
// Identity provider is deterministic here; live Keycloak proof is a separate smoke.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { createApp,createRouter,toWebHandler,defineEventHandler,createError,readBody,getQuery,getRouterParam,getHeader,getRequestURL,setResponseStatus,useSession } from 'h3'
const require=createRequire(import.meta.url)
const defaultPermissions=require('../../services/utils/role-permissions')
const {Request,fetch:nodeFetch}=require('../../frontend/node_modules/undici')
let gatewayAddress=''
const password='synthetic-sealed-test-session-password-at-least-32-characters'
export const valid={eventName:'BFF summit',purpose:'Learning',description:'Synthetic',proposedDate:'2028-11-20',startTime:'00:00',endTime:'02:00',timeZone:'Asia/Singapore',expectedAttendance:100,venueType:'physical',preferredLayout:'theatre',venueRequirements:'A hall',accessibilityNeeds:['wheelchair'],equipmentNeeds:['projector'],saveAs:'submit'}
export async function eventHarness(){
 const prefix='bff-'+randomUUID()
 const permissionOverrides=new Map<string,string[]>()
 const users:Record<string,any>={owner:{id:prefix+'-owner',role:'EVENT_ORGANISER',roles:['EVENT_ORGANISER'],organisationId:'org-bff'},other:{id:prefix+'-other',role:'EVENT_ORGANISER',roles:['EVENT_ORGANISER'],organisationId:'org-other'},coord:{id:prefix+'-coord',role:'EVENT_COORDINATOR',roles:['EVENT_COORDINATOR']},attendee:{id:prefix+'-attendee',role:'ATTENDEE',roles:['ATTENDEE']}}
 for(const [who,u] of Object.entries(users))Object.assign(u,{firstName:who,lastName:'Synthetic',email:who+'@example.test',name:who+' Synthetic',company:'Synthetic Org',isActive:true})
 const identity=createServer(async(req,res)=>{let text='';for await(const b of req)text+=b;const token=req.url?.startsWith('/auth')?(req.headers.authorization||'').slice(7):text?JSON.parse(text).token:undefined
  const body=req.url==='/internal/coordinators'?{coordinators:[{id:users.coord.id,createdAt:'2020-01-01'}]}:req.url?.startsWith('/internal/users/')?Object.values(users).find(u=>u.id===decodeURIComponent(req.url!.split('/').at(-1)!)):req.url?.startsWith('/auth')?{user:users[token!],permissions:permissionOverrides.get(token!)??[...new Set((users[token!]?.roles??[]).flatMap((role:string)=>defaultPermissions[role]??[]))]}:{valid:!!users[token!],user:users[token!],permissions:permissionOverrides.get(token!)??[...new Set((users[token!]?.roles??[]).flatMap((role:string)=>defaultPermissions[role]??[]))]}
  res.writeHead(body && (req.url?.includes('coordinators')||req.url?.includes('/users/')||users[token!])?200:401,{'content-type':'application/json'});res.end(JSON.stringify(body??{}))
 });await new Promise<void>(r=>identity.listen(0,'127.0.0.1',r))
 const identityUrl='http://127.0.0.1:'+(identity.address() as any).port
 process.env.AUTH_SERVICE_URL=process.env.USER_SERVICE_URL=identityUrl;process.env.INTERNAL_API_KEY='bff-integration-key'
 const config=require('../../services/event-service/src/config.js');config.authServiceUrl=identityUrl;config.userServiceUrl=identityUrl;config.internalApiKey='bff-integration-key'
 const service=require('../../services/event-service/src/app.js').listen(0,'127.0.0.1');await new Promise<void>(r=>service.once('listening',r));const serviceUrl='http://127.0.0.1:'+service.address().port
 const gateway=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const r=await nodeFetch((req.url?.startsWith('/auth')?identityUrl:serviceUrl)+req.url,{method:req.method,headers:{'content-type':'application/json',authorization:req.headers.authorization??'','Idempotency-Key':String(req.headers['idempotency-key']??'')},...(body?{body}:{})});res.writeHead(r.status,{'content-type':'application/json'});res.end(await r.text())});await new Promise<void>(r=>gateway.listen(0,'127.0.0.1',r));const gatewayUrl='http://127.0.0.1:'+(gateway.address() as any).port;gatewayAddress=gatewayUrl
 for(const [name,fn] of Object.entries({defineEventHandler,createError,readBody,getQuery,getRouterParam,getHeader,getRequestURL,setResponseStatus}))vi.stubGlobal(name,fn)
 vi.stubGlobal('useRuntimeConfig',()=>({apiBaseUrl:gatewayUrl,authMode:'live'}))
 vi.stubGlobal('requireUserSession',async(event:any)=>{const s=await useSession(event,{password,name:'nuxt-session'});if(!s.data.user)throw createError({statusCode:401,statusMessage:'Unauthorized'});return s.data})
 vi.stubGlobal('clearUserSession',async(event:any)=>(await useSession(event,{password,name:'nuxt-session'})).clear())
 // Contract fixture for the Kong forwarding boundary. Domain data/auth checks
 // are real HTTP/Prisma; full backendFetch/session wiring is verified live.
 vi.doMock('../../frontend/server/utils/kongBff',()=>({
  idempotencyHeaders:(event:any)=>{const key=getHeader(event,'idempotency-key');return key?{'Idempotency-Key':key}:undefined},
  segmentPath:(segments:string[])=>segments.map(segment=>encodeURIComponent(segment)).join('/'),
  kongBffFetch:async(event:any,path:string,options:any={})=>{
  const s=await useSession(event,{password,name:'nuxt-session'});const token=(s.data as any).secure?.token
  if(!token)throw createError({statusCode:401,statusMessage:'Unauthorized'})
  const target=new URL(path,gatewayAddress);for(const [key,value] of Object.entries(options.query??{}))target.searchParams.set(key,String(value))
  const r=await nodeFetch(target,{method:options.method??'GET',headers:{'content-type':'application/json',Authorization:'Bearer '+token,...options.headers},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await r.json()
  if(!r.ok)throw createError({statusCode:r.status,statusMessage:data.error?.message??'Unavailable',data})
  return data
 }}))
 const app=createApp(),router=createRouter();
 const routes=[['post','/api/events','events.post'],['get','/api/events','events.get'],['get','/api/review-queue','review-queue.get'],['get','/api/events/:id','events/[id].get'],['put','/api/events/:id','events/[id].put'],['post','/api/events/:id/decision','events/[id]/decision.post'],['get','/api/events/:id/activity','events/[id]/activity.get'],['get','/api/events/:id/coordinator','events/[id]/coordinator.get']]
 const modules=import.meta.glob('../../frontend/server/api/**/*.ts')
 for(const [method,path,file] of routes){const handler=(await modules[`../../frontend/server/api/${file}.ts`]!() as any).default;(router as any)[method!](path,handler)}
 router.get('/test-session',defineEventHandler(async(event)=>{const who=String(getQuery(event).who);const s=await useSession(event,{password,name:'nuxt-session'});await s.update({user:users[who],secure:{token:who}});return {ok:true}}));app.use(router);const handle=toWebHandler(app)
 const cookies:Record<string,string>={};for(const who of Object.keys(users)){const r=await handle(new Request('http://localhost/test-session?who='+who));cookies[who]=(r.headers.get('set-cookie')||'').split(';')[0]!}
 return {users,permissionOverrides,db:require('../../services/event-service/src/db'),async call(method:string,path:string,body?:any,who:string|null='owner',key=randomUUID(),extra={}){
  const r=await handle(new Request('http://localhost'+path,{method,headers:{'content-type':'application/json',...(who?{cookie:cookies[who]!}:{}),'Idempotency-Key':key,...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json() as any}
 },async close(){vi.unstubAllGlobals();vi.doUnmock('../../frontend/server/utils/kongBff');await Promise.all([service,identity,gateway].map(s=>new Promise<void>(r=>s.close(()=>r()))));await require('../../services/event-service/src/db').$disconnect()}}
}
