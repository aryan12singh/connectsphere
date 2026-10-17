const config=require('./config');
async function read(path){
 let response;try{response=await fetch(config.eventServiceUrl+path,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)});}catch{throw Object.assign(new Error('Current Event context is unavailable'),{status:503,code:'EVENT_UNAVAILABLE'});}
 if(!response.ok)throw Object.assign(new Error('Current approved Event context is required'),{status:response.status===404?404:503,code:'EVENT_UNAVAILABLE'});
 const value=await response.json();if(!value.eventRequestId||!value.eventId||!value.requirementsRevision)throw Object.assign(new Error('Event context is incomplete'),{status:503,code:'EVENT_UNAVAILABLE'});return value;
}
function effectiveNeeds(value){const needs=value.equipmentNeeds||[];const none=needs.filter(x=>String(x).trim().toLowerCase()==='no equipment required');if(none.length&&none.length!==needs.length)throw Object.assign(new Error('Contradictory Event equipment requirements'),{status:409,code:'TECHNICAL_REQUIREMENTS_CONFLICT'});return {...value,equipmentNeeds:none.length?[]:needs};}
async function requestContext(id){return effectiveNeeds(await read(`/internal/requests/${encodeURIComponent(id)}/technical-context`));}
async function eventContext(id){
 const response=await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(id)}/planning-context`,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Object.assign(new Error('Current Event context is unavailable'),{status:503,code:'EVENT_UNAVAILABLE'});
 const value=await response.json();if(value.id!==id||!value.technicalRequirementsRevision)throw Object.assign(new Error('Event context is incomplete'),{status:503,code:'EVENT_UNAVAILABLE'});
 return effectiveNeeds({...value,eventId:value.id,requirementsRevision:value.technicalRequirementsRevision});
}
module.exports={requestContext,eventContext};
