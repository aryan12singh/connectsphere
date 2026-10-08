// Event request and event routes implement docs/openapi.yaml. The BFF reaches
// these endpoints through Kong; this service never handles browser cookies.
const express = require('express');
const helmet = require('helmet');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/event-requests', require('./routes/event-requests.routes'));
app.use('/events', require('./routes/events.routes'));
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
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
// Minimal assignment proof for booking-service, using the caller's own token.
app.get('/events/:id/booking-access',requirePermission('events.view','venue_bookings.create'),async(req,res)=>{
 const event=await prisma.event.findUnique({where:{id:req.params.id},include:{eventRequest:true}});
 if(!has(req.actor,'EVENT_COORDINATOR')||!event||event.eventRequest.currentCoordinatorId!==req.actor.id)throw fail(403,'FORBIDDEN','Event is not assigned to you');
 res.json({id:event.id});
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
 // Parser messages can contain private input; expose only stable transport errors.
 if(err.type==='entity.parse.failed')return res.status(400).json({error:{code:'BAD_REQUEST',message:'Use a valid JSON object.'}});
 if(err.type==='entity.too.large')return res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'Request body must be at most 10 KB.'}});
 const status=err.status||500;
 // Log only exception classification, not request bodies/tokens/database values.
 if(status>=500)console.error('event-service error',err.code||err.name);
 res.status(status).json({error:{code:err.code||'INTERNAL',message:status===500?'Unable to save the request. Please retry.':err.message,...(err.fields?{fields:err.fields}:{}),...(err.field?{fields:{[err.field]:[err.message]}}:{})}});
});
module.exports=app;
