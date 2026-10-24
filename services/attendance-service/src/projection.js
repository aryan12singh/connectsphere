// Read the current confirmed source and effective rooms. Registration records
// remain Attendance-owned and are never rewritten by a venue adjustment.
const config=require('./config');
const store=require('./store');
async function read(base,path,allowMissing=false){
 let response;try{response=await fetch(base+path,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)});}catch{throw Object.assign(Error('Unable to verify the effective Event'),{status:503,code:'EVENT_UNAVAILABLE'});}
 if(allowMissing&&(response.status===409||response.status===404))return null;
 if(!response.ok)throw Object.assign(Error('Unable to verify the effective Event'),{status:503,code:'EVENT_UNAVAILABLE'});
 return response.json();
}
async function effectiveEvent(event){
  if(event?.eventId!==event?.id||!event?.id||event.status!=='CONFIRMED')throw Object.assign(Error('Unable to verify the effective Event identity'),{status:503,code:'EVENT_UNAVAILABLE'});
  const venues=await read(config.bookingServiceUrl,`/internal/events/${encodeURIComponent(event.id)}/public-venues`,true);
  if(!venues)return null;
  if(venues.eventId!==event.id||!Array.isArray(venues.venues)||!venues.venues.length)throw Object.assign(Error('Unable to verify the effective Event identity'),{status:503,code:'EVENT_UNAVAILABLE'});
  const saved=await store.findEvent(event.id);
  return {...event,...venues,registrationLimit:saved?.registrationLimit??null};
}
async function list(){
 if(config.dataMode!=='prisma')return store.listEvents();
 const source=await read(config.eventServiceUrl,'/internal/attendee-events');
 if(!Array.isArray(source?.items))throw Object.assign(Error('Unable to verify the Event catalogue'),{status:503,code:'EVENT_UNAVAILABLE'});
 const events=[];
 // Bound upstream concurrency while avoiding a serialized full-catalogue read.
 for(let index=0;index<source.items.length;index+=8)events.push(...(await Promise.all(source.items.slice(index,index+8).map(effectiveEvent))).filter(Boolean));
 return events;
}
async function find(id){
 if(config.dataMode!=='prisma')return (await store.listEvents()).find(event=>event.eventId===id)||null;
 const event=await read(config.eventServiceUrl,`/internal/attendee-events/${encodeURIComponent(id)}`,true);
 if(!event)return null;
 if(event.id!==id)throw Object.assign(Error('Unable to verify the requested Event identity'),{status:503,code:'EVENT_UNAVAILABLE'});
 return effectiveEvent(event);
}
module.exports={list,find};
