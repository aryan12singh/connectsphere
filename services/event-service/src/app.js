const express=require('express');
const helmet=require('helmet');
const prisma=require('./db');
const {authenticate,requirePermission,contact}=require('./identity');
const {mutation,read,load,dto,history,has}=require('./workflows');
const {fail}=require('./domain/validation');
const app=express();app.use(helmet());app.use(express.json({limit:'64kb'}));
app.use('/docs',express.static(require('node:path').resolve(__dirname,'../docs')));
app.get('/health',(req,res)=>res.json({status:'ok'}));
app.use(['/event-requests','/events'],authenticate);
app.get('/event-requests/review-queue',requirePermission('events.view','event_requests.review'),async(req,res)=>{
 if(!has(req.actor,'EVENT_COORDINATOR'))throw fail(403,'FORBIDDEN','Only Coordinators may view the queue');
 const rows=await prisma.eventRequest.findMany({where:{status:'SUBMITTED',currentCoordinatorId:req.actor.id,organiserId:{not:req.actor.id}},include:{event:true},orderBy:[{submittedAt:'desc'},{id:'desc'}]});
 res.json({items:await Promise.all(rows.map(async r=>({...dto(r),organiser:await contact(r.organiserId)})))});
});
app.get(['/event-requests','/event-requests/drafts'],requirePermission('events.view'),async(req,res)=>{
 if(!has(req.actor,'EVENT_ORGANISER'))throw fail(403,'FORBIDDEN','Only Organisers may list their requests');
 const where={organiserId:req.actor.id};if(req.path.endsWith('/drafts'))where.status='DRAFT';else if(req.query.status)where.status={in:[].concat(req.query.status).filter(s=>['DRAFT','SUBMITTED','RETURNED_FOR_AMENDMENT','APPROVED','REJECTED'].includes(s))};
 // Private request lists are always own; organisation visibility is on Events.
 const rows=await prisma.eventRequest.findMany({where,include:{event:true},orderBy:[{updatedAt:'desc'},{id:'desc'}]});res.json({items:rows.map(dto)});
});
app.get('/events',requirePermission('events.view'),async(req,res)=>{
 const actor=req.actor;let where;
 if(has(actor,'EVENT_ORGANISER'))where={OR:[{organiserId:actor.id},...(actor.organisationId?[{organisationId:actor.organisationId}]:[])]};
 else if(has(actor,'EVENT_COORDINATOR'))where={eventRequest:{currentCoordinatorId:actor.id}};
 else if(has(actor,'VENUE_STAFF')||has(actor,'TECHNICAL_SUPPORT_STAFF'))where={status:{in:['ARRANGEMENT_PENDING','CONFIRMED']}};
 else throw fail(403,'FORBIDDEN','Event options are unavailable for this role');
 // Option projection for booking integration. Contains no private request fields.
 const events=await prisma.event.findMany({where,select:{id:true,title:true,status:true}});res.json({items:events});
});
app.get('/events/:id/activity',requirePermission('events.view'),async(req,res)=>{
 const event=await prisma.event.findUnique({where:{id:req.params.id}});if(!event)throw fail(404,'NOT_FOUND','Event not found');const r=await load(prisma,event.eventRequestId);res.json(await history(req.actor,r,req.query,true));
});
app.get('/event-requests/:id',requirePermission('events.view'),async(req,res)=>{const r=await load(prisma,req.params.id);read(req.actor,r);res.json(dto(r));});
app.get('/event-requests/:id/activity',requirePermission('events.view'),async(req,res)=>{const r=await load(prisma,req.params.id);res.json(await history(req.actor,r,req.query));});
app.get('/event-requests/:id/coordinator',requirePermission('events.view'),async(req,res)=>{const r=await load(prisma,req.params.id);read(req.actor,r);res.json(r.currentCoordinatorId?await contact(r.currentCoordinatorId):null);});
async function mutate(req,res,mode,id){const result=await mutation(req,mode,id);if(result.replayed)res.set('Idempotency-Replayed','true');res.status(result.status).json(result.body);}
app.post('/event-requests',requirePermission('event_requests.create'),(req,res)=>mutate(req,res,'create'));
app.put('/event-requests/:id',requirePermission('event_requests.create'),(req,res)=>mutate(req,res,'save',req.params.id));
app.patch('/event-requests/:id',requirePermission('event_requests.create'),(req,res)=>mutate(req,res,'save',req.params.id));
for(const action of ['submit','resubmit','decision'])app.post(`/event-requests/:id/${action}`,requirePermission(action==='decision'?'event_requests.review':'event_requests.create'),(req,res)=>mutate(req,res,action,req.params.id));
app.use((req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Not found'}}));
app.use((err,req,res,next)=>{
 const status=err.status||500;
 // Log only exception classification, not request bodies/tokens/database values.
 if(status>=500)console.error('event-service error',err.code||err.name);
 res.status(status).json({error:{code:err.code||'INTERNAL',message:status===500?'Unable to save the request. Please retry.':err.message,...(err.fields?{fields:err.fields}:{}),...(err.field?{fields:{[err.field]:[err.message]}}:{})}});
});
module.exports=app;
