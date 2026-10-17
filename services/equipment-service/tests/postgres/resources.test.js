const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {requireTestDatabase,start}=require('../../../../tests/helpers/service-integration.cjs');
requireTestDatabase('equipment');
const prisma=require('../../src/db'),config=require('../../src/config');
const contexts=new Map();let api,source;
const coordinator={'x-test-user-id':'coordinator','x-test-role':'EVENT_COORDINATOR'},support={'x-test-user-id':'support','x-test-role':'TECHNICAL_SUPPORT_STAFF'};
async function call(path,body,actor=coordinator,key=randomUUID(),method='POST'){return api.http(path,{method,body,headers:{...actor,'idempotency-key':key}});}
async function submit(id,{equipment=[{equipmentType:'projector',quantity:2}],supportRequired=false,notRequired=false,version=1,...extra}={}){
 if(!contexts.has(id))contexts.set(id,{eventId:'event-'+id,eventRequestId:id,id:'event-'+id,currentCoordinatorId:'coordinator',status:'ARRANGEMENT_PENDING',safetyState:'NOT_SUBMITTED',requirementsRevision:'source-'+id,technicalRequirementsRevision:'source-'+id,equipmentNeeds:[],technicalDetails:'',startAt:'2028-11-20T01:00:00Z',endAt:'2028-11-20T09:00:00Z'});
 return call('/event-requests/'+id+'/technical-request',{version,equipment,supportRequired,supportDetails:supportRequired?'Approved support plan':'',placementDetails:'Keep equipment clear of all exits',notRequired,...extra});
}
async function approve(id,extra={},key=randomUUID()){return call('/event-requests/'+id+'/technical-request/decision',{version:1,decision:'APPROVED',...extra},support,key);}
async function reserve(id,body={version:1},key=randomUUID()){return call('/event-requests/'+id+'/technical-request/reservations',body,support,key);}
before(async()=>{
 await prisma.idempotencyRecord.deleteMany();await prisma.technicalReadinessFence.deleteMany();await prisma.equipmentReservation.deleteMany();await prisma.equipmentStock.deleteMany();await prisma.technicalRequestHistory.deleteMany();await prisma.technicalRequest.deleteMany();await prisma.outboxEvent.deleteMany();
 const express=require('express'),app=express();
 app.get('/internal/requests/:id/technical-context',(req,res)=>contexts.has(req.params.id)?res.json(contexts.get(req.params.id)):res.sendStatus(404));
 app.get('/internal/events/:id/planning-context',(req,res)=>{const value=[...contexts.values()].find(x=>x.eventId===req.params.id);return value?res.json(value):res.sendStatus(404);});
 source=await start(app);config.eventServiceUrl=source.base;
 // Explicit authentication adapter; production source checks stay enabled.
 process.env.AUTH_MODE='mock';config.isTest=false;api=await start(require('../../src/app'));
});
after(async()=>{await api?.close();await source?.close();await prisma.$disconnect();});
test('real stock API denies other roles and cannot reduce below overlapping reservations',async()=>{
 assert.equal((await api.http('/equipment-inventory',{headers:coordinator})).status,403);
 const inventory=await api.http('/equipment-inventory',{headers:support});assert.equal(inventory.status,200);assert.equal(inventory.body.items.length,5);
 const row=inventory.body.items.find(x=>x.equipmentType==='projector');assert.equal((await call('/equipment-inventory/projector',{version:row.version,total:3},support,randomUUID(),'PUT')).status,200);
});
let winner;
test('concurrent current Technical approvals replay once and last stock is reserved atomically',async()=>{
 for(const id of ['race-a','race-b']){assert.equal((await submit(id)).status,201);const key=randomUUID();const results=await Promise.all([approve(id,{},key),approve(id,{},key)]);assert.deepEqual(results.map(r=>r.status),[200,200]);}
 const pair=await Promise.all(['race-a','race-b'].map(id=>reserve(id)));assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);winner=pair[0].status===200?'race-a':'race-b';
 const rows=await prisma.equipmentReservation.findMany({where:{active:true}});assert.equal(rows.length,1);assert.equal(rows[0].quantity,2);
 const stock=await prisma.equipmentStock.findUnique({where:{equipmentType:'projector'}});
 const reduced=await call('/equipment-inventory/projector',{version:stock.version,total:1},support,randomUUID(),'PUT');assert.equal(reduced.status,409);assert.equal((await prisma.equipmentStock.findUnique({where:{equipmentType:'projector'}})).total,3);
});
test('explicit complete replacement releases obsolete stock for support-only v2, with history',async()=>{
 assert.equal((await submit(winner,{version:1,equipment:[],supportRequired:true})).status,200);
 assert.equal((await approve(winner,{version:2})).status,200);
 const released=await reserve(winner,{version:2});assert.equal(released.status,200);assert.deepEqual(released.body.reservations,[]);
 assert.equal(await prisma.equipmentReservation.count({where:{eventRequestId:winner,active:true}}),0);assert.equal(await prisma.equipmentReservation.count({where:{eventRequestId:winner,active:false}}),1);
 const proof=await api.http('/internal/events/event-'+winner+'/readiness',{headers:{'x-internal-api-key':config.internalApiKey}});assert.equal(proof.body.status,'APPROVED');
});
test('generic unknown-need promises stay blocked; explicit versioned support-only classification is retained',async()=>{
 const id='additional-need';contexts.set(id,{eventId:'event-'+id,eventRequestId:id,id:'event-'+id,currentCoordinatorId:'coordinator',status:'ARRANGEMENT_PENDING',safetyState:'NOT_SUBMITTED',requirementsRevision:'source-'+id,technicalRequirementsRevision:'source-'+id,equipmentNeeds:['Live streaming setup'],technicalDetails:'Broadcast technician only; permanent camera supplied by venue',startAt:'2028-11-21T01:00:00Z',endAt:'2028-11-21T09:00:00Z'});
 assert.equal((await submit(id,{equipment:[],supportRequired:true})).status,201);assert.equal((await approve(id)).status,422);
 const coverageResolution=[{need:'Live streaming setup',mode:'SUPPORT_ONLY',note:'Reviewed permanent venue camera setup; no portable inventory needed',equipmentTypes:[]}];
 assert.equal((await approve(id,{coverageResolution})).status,200);
 const proof=await api.http('/internal/events/event-'+id+'/readiness',{headers:{'x-internal-api-key':config.internalApiKey}});assert.equal(proof.body.status,'APPROVED');assert.equal(proof.body.coverageResolution.reviewedById,'support');
 contexts.get(id).requirementsRevision='changed-source';contexts.get(id).technicalRequirementsRevision='changed-source';
 const stale=await api.http('/internal/events/event-'+id+'/readiness',{headers:{'x-internal-api-key':config.internalApiKey}});assert.equal(stale.body.status,'UNVERIFIED');
});
test('a source reassignment under the owner lock denies the former Coordinator before persistence',async()=>{
 const id='reassigned';contexts.set(id,{...contexts.get('race-a'),eventId:'event-'+id,id:'event-'+id,eventRequestId:id,currentCoordinatorId:'new-coordinator',requirementsRevision:'reassigned',technicalRequirementsRevision:'reassigned'});
 assert.equal((await submit(id)).status,403);assert.equal(await prisma.technicalRequest.count({where:{eventRequestId:id}}),0);
});
