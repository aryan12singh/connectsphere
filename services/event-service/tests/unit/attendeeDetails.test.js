const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attendeeDetails,attendeeDetailsChanged}=require('../../src/safety');

test('attendee-safe confirmed details normalize timestamps and omit internal fields',()=>{
 const value=attendeeDetails({title:'Summit',description:'Public details',startAt:'2028-11-20T01:00:00Z',endAt:'2028-11-20T03:00:00Z',timeZone:'Asia/Singapore',eventRequest:{registrationEnabled:true,registrationOpensAt:'2028-11-01T00:00:00Z',registrationClosesAt:'2028-11-18T00:00:00Z'},safetyToken:'private'});
 assert.deepEqual(value,{status:'CONFIRMED',title:'Summit',description:'Public details',startAt:'2028-11-20T01:00:00.000Z',endAt:'2028-11-20T03:00:00.000Z',timeZone:'Asia/Singapore',registrationEnabled:true,registrationOpensAt:'2028-11-01T00:00:00.000Z',registrationClosesAt:'2028-11-18T00:00:00.000Z'});
});

test('a later confirmation is marked for Attendees only when effective safe details changed',()=>{
 const baseline={title:'Summit',description:'Public details',startAt:'2028-11-20T01:00:00Z',endAt:'2028-11-20T03:00:00Z',timeZone:'Asia/Singapore',registrationEnabled:true,registrationOpensAt:'2028-11-01T00:00:00Z',registrationClosesAt:'2028-11-18T00:00:00Z'};
 assert.equal(attendeeDetailsChanged(baseline,{...baseline}),false);
 assert.equal(attendeeDetailsChanged(baseline,{...baseline,startAt:'2028-11-21T01:00:00Z'}),true);
 assert.equal(attendeeDetailsChanged(baseline,{...baseline,registrationClosesAt:'2028-11-19T00:00:00Z'}),true);
 assert.equal(attendeeDetailsChanged(null,{...baseline}),false,'first confirmation is not an update');
});
