// Isolated actual view guard; fake resource proof/current review only, no live writes.
const fs=require('node:fs'),Module=require('node:module'),{createHash}=require('node:crypto');
const target=require.resolve('../../services/event-service/src/safety.js');
const eventLock=require.resolve('../../services/event-service/src/eventLock.js');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),clone=x=>structuredClone(x);
let event,round,venues;
const technical={eventId:'e1',status:'NOT_REQUIRED',fingerprint:'technical-stable',placementDetails:'No portable equipment',equipment:[]};
const db={event:{findUnique:async()=>clone(event)},safetyRound:{findUnique:async()=>clone(round)}};
const realLoad=Module._load;
Module._load=function(spec,parent,...rest){
 if(parent?.filename===eventLock&&spec==='./db')return db;
 if(parent?.filename===target){
  if(spec==='./db')return db;
  if(spec==='./config')return {bookingServiceUrl:'http://booking',equipmentServiceUrl:'http://equipment',internalApiKey:'isolated'};
  if(spec==='./workflows')return {dto:x=>x};
 }
 return realLoad.call(this,spec,parent,...rest);
};
global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).startsWith('http://booking')?{eventId:'e1',venueReady:true,outstanding:[],fingerprint:'venue-current',snapshot:{venues:clone(venues)}}:technical});
const safety=require(target),actor={id:'c1',roles:['EVENT_COORDINATOR'],permissions:['safety.submit','safety.rework']};
const room={bookingId:'b1',venueId:'v1',venueName:'Hall',venueType:'PHYSICAL',expectedAttendance:10,capacity:20,layout:'THEATRE',bookingStartAt:'2027-01-01T01:00:00Z',bookingEndAt:'2027-01-01T02:00:00Z',occupiedStartAt:'2027-01-01T00:30:00Z',occupiedEndAt:'2027-01-01T02:30:00Z',accessibilityNeeds:[],accessibilityDetails:null,venueRequirements:null,emergencyAccess:'Original access arrangement',equipmentPlacement:'No portable equipment',crowdMovement:'Original flow',restrictions:'Original restrictions',bookingVersion:1,venueVersion:1,required:true,flags:[]};
function reset(){
 event={id:'e1',eventRequestId:'r1',organiserId:'o1',title:'Fixture',version:4,status:'ARRANGEMENT_PENDING',safetyState:'CHANGES_REQUIRED',safetyRoundId:'round1',safetyToken:null,startAt:room.bookingStartAt,endAt:room.bookingEndAt,eventRequest:{id:'r1',status:'APPROVED',version:1,currentCoordinatorId:'c1'}};
 round={id:'round1',number:1,status:'REJECT',requirementsRevision:'old-proof',snapshot:{venues:[clone(room)]},decision:{outcome:'REJECT',rejectedBookingIds:['b1'],areas:['VENUE']}};
 venues=[clone(room)];
 event.safetyRework={roundId:'round1',reviewedById:'c1',reviewedRevision:hash([safety.revision(event,event.eventRequest),'venue-current','technical-stable'])};
}
async function observe(label,setup){reset();setup();event.safetyRework.reviewedRevision=hash([safety.revision(event,event.eventRequest),'venue-current','technical-stable']);const value=await safety.view('e1',actor);return {case:label,canSubmit:value.canSubmit,outstanding:value.outstanding};}
(async()=>{
 console.log(JSON.stringify({target,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),executedAt:new Date().toISOString(),layer:'isolated actual view; not live acceptance'}));
 for(const [label,setup] of [
  ['unchanged rejected booking',()=>{}],
  ['metadata-only booking and venue version change',()=>{venues[0].bookingVersion++;venues[0].venueVersion++;}],
  ['corrected rejected room access',()=>{venues[0].emergencyAccess='Recorded corrected access arrangement';}],
  ['cancel and recreate same room with identical Safety facts',()=>{venues[0].bookingId='new-booking';}],
  ['replace rejected room with different venue',()=>{venues[0].bookingId='new-booking';venues[0].venueId='new-venue';}],
  ['two rejected rooms, only one corrected',()=>{const second={...clone(room),bookingId:'b3',venueId:'v3'};round.snapshot.venues.push(second);round.decision.rejectedBookingIds.push('b3');venues.push(clone(second));venues[0].emergencyAccess='Corrected access';}],
  ['same venue has earlier changed session then unchanged recreated rejected session',()=>{
   // Two adjacent, zero-buffer sessions: old review used v2 then v1;
   // new arrangement uses v1 for both and preserves the rejected second slot.
   event.startAt='2027-01-01T00:00:00Z';
   const rejected={...clone(room),occupiedStartAt:room.bookingStartAt,occupiedEndAt:room.bookingEndAt};
   const earlier={...clone(rejected),bookingStartAt:'2027-01-01T00:00:00Z',bookingEndAt:'2027-01-01T01:00:00Z',occupiedStartAt:'2027-01-01T00:00:00Z',occupiedEndAt:'2027-01-01T01:00:00Z'};
   round.snapshot.venues=[rejected,{...clone(earlier),bookingId:'old-other-session',venueId:'v2'}];
   venues=[{...clone(earlier),bookingId:'a-new-session'},{...clone(rejected),bookingId:'z-recreated-rejected'}];
  }],
  ['only accessibility tag ordering changes',()=>{round.snapshot.venues[0].accessibilityNeeds=['WHEELCHAIR_ACCESS','HEARING_LOOP'];venues[0].accessibilityNeeds=['HEARING_LOOP','WHEELCHAIR_ACCESS'];}],
 ])console.log(JSON.stringify(await observe(label,setup)));
})().catch(error=>{console.error(error);process.exitCode=1;});
