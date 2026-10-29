const {test}=require('node:test');
const assert=require('node:assert/strict');
const config=require('../../src/config');
const store=require('../../src/store');
const projection=require('../../src/projection');

async function withSources(work){
 const original={fetch:global.fetch,mode:config.dataMode,findEvent:store.findEvent};
 config.dataMode='prisma';
 store.findEvent=async()=>({id:'historical-fixture-alias',eventId:'actual-event',registrationLimit:90,withdrawalEnabled:true,withdrawalCutoffAt:'2030-01-01T00:00:00Z',allowReregistration:true,primaryVenueName:'Retired venue',internalNotes:'Private stored note',safetyReviews:[{privateNotes:'Private assessment'}]});
 try{await work();}finally{global.fetch=original.fetch;config.dataMode=original.mode;store.findEvent=original.findEvent;}
}
const event={id:'actual-event',eventId:'actual-event',title:'Confirmed conference',status:'CONFIRMED'};
const venues={eventId:'actual-event',venues:[{id:'effective-venue',name:'Current venue'}],primaryVenueId:'effective-venue',primaryVenueName:'Current venue'};
const answer=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('TC-CS92-02 current venue projection uses actual Event identity and preserves only Attendance registration policy',async()=>withSources(async()=>{
 const calls=[];
 global.fetch=async url=>{calls.push(String(url));if(String(url).includes('/attendee-events/'))return String(url).endsWith('/actual-event')?answer(event):answer({},404);assert.ok(String(url).endsWith('/internal/events/actual-event/public-venues'));return answer(venues);};
 const result=await projection.find('actual-event');
 assert.equal(result.id,'actual-event');assert.equal(result.registrationLimit,90);assert.equal(result.primaryVenueName,'Current venue');assert.deepEqual(result.venues,venues.venues);assert.equal(result.internalNotes,undefined);assert.equal(result.safetyReviews,undefined);
 assert.equal(result.withdrawalEnabled,true);assert.equal(result.withdrawalCutoffAt,'2030-01-01T00:00:00Z');assert.equal(result.allowReregistration,true);
 assert.ok(calls.some(url=>url.endsWith('/internal/events/actual-event/public-venues')));
 assert.equal(await projection.find('historical-fixture-alias'),null);
 assert.ok(!calls.some(url=>url.endsWith('/attendee-events')),'Opening one Event must not rebuild the full catalogue');
}));

test('missing Attendance policy fails closed and explicit disabled settings remain disabled',async()=>withSources(async()=>{
 global.fetch=async url=>answer(String(url).includes('/attendee-events/')?event:venues);
 for(const saved of [null,{registrationLimit:90,withdrawalEnabled:false,withdrawalCutoffAt:null,allowReregistration:false}]){
  store.findEvent=async()=>saved;
  const result=await projection.find('actual-event');
  assert.equal(result.registrationLimit,saved?.registrationLimit??null);
  assert.equal(result.withdrawalEnabled,false);
  assert.equal(result.withdrawalCutoffAt,null);
  assert.equal(result.allowReregistration,false);
 }
}));

test('TC-CS92-09 unready or missing effective venue proof hides the Event and never falls back to historical local locations',async()=>withSources(async()=>{
 for(const status of [404,409]){
  global.fetch=async url=>answer(String(url).endsWith('/attendee-events')?{items:[event]}:{},String(url).endsWith('/attendee-events')?200:status);
  assert.deepEqual(await projection.list(),[]);
 }
 global.fetch=async url=>answer(String(url).endsWith('/attendee-events')?{items:[event]}:{...venues,eventId:'another-event'});
 await assert.rejects(()=>projection.list(),error=>error.status===503);
 global.fetch=async()=>answer({...event,id:'other-event'});await assert.rejects(()=>projection.find('actual-event'),error=>error.status===503);
 global.fetch=async()=>answer({});await assert.rejects(()=>projection.list(),error=>error.status===503);
}));

test('TC-CS92-02 unavailable source services fail closed instead of returning a misleading empty attendee list',async()=>withSources(async()=>{
 for(const status of [404,503]){
  global.fetch=async()=>answer({},status);await assert.rejects(()=>projection.list(),error=>error.status===503);
 }
 global.fetch=async()=>{throw Error('Source connection lost');};await assert.rejects(()=>projection.list(),error=>error.status===503);
 global.fetch=async url=>answer(String(url).endsWith('/attendee-events')?{items:[event]}:{},String(url).endsWith('/attendee-events')?200:503);
 await assert.rejects(()=>projection.list(),error=>error.status===503);
}));
