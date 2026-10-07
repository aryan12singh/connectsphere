const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalise,localToInstant,changes,snapshot}=require('../src/domain/validation');
const valid={eventName:'A',purpose:'Purpose',proposedDate:'2028-01-01',startTime:'00:00',endTime:'01:00',timeZone:'Asia/Singapore',expectedAttendance:1,venueType:'physical'};
test('CS11: Singapore midnight round trip independent of host timezone',()=>{assert.equal(localToInstant('2028-01-01','00:00','Asia/Singapore').toISOString(),'2027-12-31T16:00:00.000Z');});
test('CS11: real dates, daylight-saving gaps and repeated clocks rejected',()=>{for(const args of [['2028-02-30','09:00','Asia/Singapore'],['2028-03-12','02:30','America/New_York'],['2028-11-05','01:30','America/New_York']])assert.throws(()=>localToInstant(...args));});
test('CS11: valid ISO instants are accepted and round trip across local dates',()=>{const r=normalise({eventName:'A',purpose:'P',startAt:'2028-01-01T23:00:00+08:00',endAt:'2028-01-02T01:00:00+08:00',timeZone:'Asia/Singapore',expectedAttendance:1,venueType:'physical'}, {}, true);assert.equal(r.endDate,'2028-01-02');assert.equal(r.startTime,'23:00');assert.equal(r.endTime,'01:00');});
test('CS11: explicit ISO instants reject out-of-range clocks',()=>{assert.throws(()=>normalise({eventName:'A',purpose:'P',startAt:'2028-01-01T24:00:00Z',endAt:'2028-01-02T01:00:00Z',timeZone:'UTC',expectedAttendance:1,venueType:'physical'}, {}, true));});
test('CS29: one non-title field saves; zero fields, bad types and bounds fail',()=>{assert.equal(normalise({purpose:'Details'}).eventName,'');for(const body of [{},{eventName:5},{eventName:'a'.repeat(101)},{expectedAttendance:0},{expectedAttendance:1.2},{accessibilityNeeds:['']},{equipmentNeeds:'projector'}])assert.throws(()=>normalise(body));});
test('CS29: omission preserves and explicit null/empty clears saved values',()=>{const r=normalise({...valid,description:'Original'});assert.equal(normalise({purpose:'Updated'},r).description,'Original');assert.equal(normalise({description:null},r).description,null);assert.equal(normalise({description:''},r).description,null);});
test('CS11: disabling registration clears its window; enabled window required and ordered',()=>{const r=normalise({...valid,registrationEnabled:true,registrationOpensAt:'2027-12-01T09:00',registrationClosesAt:'2027-12-20T17:00'}, {}, true);assert.equal(normalise({registrationEnabled:false},r,true).registrationOpensAt,null);assert.throws(()=>normalise({...valid,registrationEnabled:true}, {}, true));assert.throws(()=>normalise({...valid,registrationEnabled:true,registrationOpensAt:'2028-01-02T00:00Z',registrationClosesAt:'2028-01-01T00:00Z'}, {}, true));});
test('CS27/44: diffs use captured fields, preserving prior values and excluding credentials',()=>{assert.deepEqual(changes({eventName:'Old',token:'hidden'},{eventName:'New',password:'hidden'}),{eventName:{old:'Old',new:'New'}});});
test('CS27/44: equivalent PostgreSQL baseline timestamp offsets are not amendments',()=>{
 const record=normalise({...valid,registrationEnabled:true,registrationOpensAt:'2027-12-01T09:00',registrationClosesAt:'2027-12-20T17:00'}, {}, true);
 const baseline=snapshot(record);
 for(const field of ['startAt','endAt','registrationOpensAt','registrationClosesAt'])baseline[field]=baseline[field].replace('.000Z','+00:00');
 assert.deepEqual(changes(baseline,normalise({},record,true)),{});
});
test('CS29/11: adding a zone to an instant-only incomplete draft preserves its overnight interval',()=>{
 const draft=normalise({startAt:'2028-11-20T15:00:00Z',endAt:'2028-11-20T17:00:00Z'});
 const zoned=normalise({timeZone:'Asia/Singapore'},draft);
 assert.equal(zoned.proposedDate,'2028-11-20');assert.equal(zoned.startTime,'23:00');
 assert.equal(zoned.endDate,'2028-11-21');assert.equal(zoned.endTime,'01:00');
 const form={...zoned,eventName:'Overnight',purpose:'Workshop',expectedAttendance:5,venueType:'physical'};
 delete form.startAt;delete form.endAt;
 const submitted=normalise(form,zoned,true);
 assert.equal(submitted.startAt.toISOString(),draft.startAt.toISOString());assert.equal(submitted.endAt.toISOString(),draft.endAt.toISOString());
});
