// Provisional CS-11 field matrix; see docs/event-workflow-decisions.md.
// This is the single authoritative validator for save, submit and resubmit.
const { GuardError } = require('./transitions');
const LIMITS = Object.freeze({ title:100, text:4000, options:100, option:200, pageSize:20 });
const TEXT_FIELDS = ['eventName','purpose','description','timeZone','preferredLayout','venueType','venueRequirements','accessibilityDetails','technicalDetails','proposedDate','endDate','startTime','endTime'];
const ARRAY_FIELDS = ['accessibilityNeeds','equipmentNeeds'];
const NUMBER_FIELDS = ['expectedAttendance','minimumCapacity'];
const INSTANT_FIELDS = ['startAt','endAt','registrationOpensAt','registrationClosesAt'];
const FIELDS = [...TEXT_FIELDS,...ARRAY_FIELDS,...NUMBER_FIELDS,'startAt','endAt','registrationEnabled','registrationOpensAt','registrationClosesAt'];
function fail(status,code,message,fields){return new GuardError(status,code,message,{fields});}
function parts(instant,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));}
function validDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(date+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===date;}
function localToInstant(date,time,zone){
 if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Use a valid date and clock time');
 const target=Date.parse(date+'T'+time+':00Z'), offsets=new Set();
 for(const days of [-2,-1,0,1,2]){const sample=new Date(target+days*86400000),p=parts(sample,zone);offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)-sample.getTime());}
 const matches=[...offsets].map(o=>new Date(target-o)).filter(d=>{const p=parts(d,zone);return `${p.year}-${p.month}-${p.day}`===date&&`${p.hour}:${p.minute}`===time;});
 if(matches.length!==1)throw new Error(matches.length?'This clock time occurs twice. Choose an unambiguous time.':'This clock time does not exist in the selected time zone.');
 return matches[0];
}
function normalise(input,previous={},complete=false){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'BAD_REQUEST','A JSON object is required');
 const data=Object.fromEntries(FIELDS.map(f=>[f,previous[f]??(ARRAY_FIELDS.includes(f)?[]:f==='registrationEnabled'?false:f==='eventName'?'':null)])),errors={};
 for(const f of TEXT_FIELDS)if(Object.hasOwn(input,f)){
  const v=input[f];if(v!==null&&typeof v!=='string'){errors[f]=['Must be text'];continue;}
  const text=v?.trim()||null;const max=f==='eventName'?LIMITS.title:LIMITS.text;if(text&&text.length>max)errors[f]=[`Must be at most ${max} characters`];data[f]=f==='eventName'?(text||''):text;
 }
 for(const f of NUMBER_FIELDS)if(Object.hasOwn(input,f)){
  const v=input[f];if(v!==null&&(!Number.isInteger(v)||v<1||v>2147483647))errors[f]=['Must be a positive whole number'];else data[f]=v;
 }
 for(const f of ARRAY_FIELDS)if(Object.hasOwn(input,f)){
  const v=input[f];if(!Array.isArray(v)||v.length>LIMITS.options||v.some(x=>typeof x!=='string'||!x.trim()||x.length>LIMITS.option))errors[f]=['Choose a valid list of options'];else data[f]=[...new Set(v.map(x=>x.trim()))].sort();
 }
 if(Object.hasOwn(input,'registrationEnabled')){if(typeof input.registrationEnabled!=='boolean')errors.registrationEnabled=['Must be on or off'];else data.registrationEnabled=input.registrationEnabled;}
 if(data.timeZone)try{parts(new Date(),data.timeZone);}catch{errors.timeZone=['Choose a valid IANA time zone'];}
 for(const f of ['proposedDate','endDate'])if(data[f]&&!validDate(data[f]))errors[f]=['Choose an actual date'];
 for(const f of ['startTime','endTime'])if(data[f]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data[f]))errors[f]=['Use a valid 24-hour time'];
 for(const f of ['startAt','endAt','registrationOpensAt','registrationClosesAt'])if(Object.hasOwn(input,f)){
  const v=input[f];if(v===null||v===''){data[f]=null;continue;}
  if(typeof v!=='string'){errors[f]=['Use an ISO 8601 timestamp'];continue;}
  try{
   if(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)&&f.startsWith('registration'))data[f]=localToInstant(v.slice(0,10),v.slice(11),data.timeZone);
   else {if(!/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(v)||!validDate(v.slice(0,10)))throw new Error();const d=new Date(v);if(isNaN(d))throw new Error();data[f]=d;}
  }catch{errors[f]=['Use a valid timestamp with a time zone (or local registration time in the event zone)'];}
 }
 // Local input is a documented adapter extension. Supplying both representations
 // is rejected rather than silently dropping/overriding fields.
 const localProvided=['proposedDate','endDate','startTime','endTime'].some(f=>Object.hasOwn(input,f));
 const instantProvided=['startAt','endAt'].some(f=>Object.hasOwn(input,f));
 const localChanged=localProvided || (!instantProvided&&Object.hasOwn(input,'timeZone')&&data.proposedDate);
 if(localProvided&&instantProvided)errors.startAt=['Supply local date/clocks or instants, not both'];
 if(localChanged||(!data.startAt&&data.proposedDate&&!instantProvided))for(const [field,clock] of [['startAt','startTime'],['endAt','endTime']]){
  data[field]=null;const date=field==='endAt'?(data.endDate||data.proposedDate):data.proposedDate;
  if(date&&data[clock]&&data.timeZone&&!errors.proposedDate&&!errors.endDate&&!errors[clock]&&!errors.timeZone)try{data[field]=localToInstant(date,data[clock],data.timeZone);}catch(e){errors[clock]=[e.message];}
 }
 // A partial ISO draft can acquire its zone later. Retain its instants and
 // derive the same local interval, including an overnight end date.
 if((instantProvided||(!localProvided&&Object.hasOwn(input,'timeZone')&&!data.proposedDate))&&data.timeZone&&!errors.timeZone){
  if(data.startAt){const p=parts(new Date(data.startAt),data.timeZone);data.proposedDate=`${p.year}-${p.month}-${p.day}`;data.startTime=`${p.hour}:${p.minute}`;}else if(Object.hasOwn(input,'startAt')){data.proposedDate=null;data.startTime=null;}
  if(data.endAt){const p=parts(new Date(data.endAt),data.timeZone),date=`${p.year}-${p.month}-${p.day}`;data.endDate=date===data.proposedDate?null:date;data.endTime=`${p.hour}:${p.minute}`;}else if(Object.hasOwn(input,'endAt')){data.endDate=null;data.endTime=null;}
 }
 if(data.startAt&&data.endAt&&new Date(data.endAt)<=new Date(data.startAt))errors.endTime=['End time must be after start time'];
 if(data.registrationOpensAt&&data.registrationClosesAt&&new Date(data.registrationClosesAt)<=new Date(data.registrationOpensAt))errors.registrationClosesAt=['Registration closing must be after opening'];
 if(!data.registrationEnabled){data.registrationOpensAt=null;data.registrationClosesAt=null;}
 if(complete){
  for(const f of ['eventName','purpose','timeZone','venueType','expectedAttendance'])if(!data[f])errors[f]=['This field is required to submit'];
  if(!data.startAt){errors.startAt??=['Start date and time are required'];if(!data.proposedDate)errors.proposedDate=['Date is required'];if(!data.startTime)errors.startTime=['Start time is required'];}
  if(!data.endAt){errors.endAt??=['End date and time are required'];if(!data.endTime)errors.endTime=['End time is required'];}
  if(data.preferredLayout?.toUpperCase()==='OTHER'&&!data.venueRequirements)errors.venueRequirements=['Describe the other layout needed'];
  if(data.registrationEnabled)for(const f of ['registrationOpensAt','registrationClosesAt'])if(!data[f])errors[f]=['Required when registration is on'];
 }else if(!FIELDS.some(f=>f!=='registrationEnabled'&&(Array.isArray(data[f])?data[f].length:!!data[f])))errors.eventName=['Fill in at least one field before saving'];
 if(Object.keys(errors).length)throw fail(422,'VALIDATION_FAILED','Please correct the highlighted fields',errors);
 return data;
}
function snapshot(record){return Object.fromEntries(FIELDS.map(f=>{
 const value=record[f];
 // PostgreSQL JSON baselines and Prisma Dates can spell the same instant
 // differently. Compare canonical instants, rather than formatting changes.
 if(value instanceof Date)return [f,value.toISOString()];
 if(INSTANT_FIELDS.includes(f)&&typeof value==='string'&&!isNaN(Date.parse(value)))return [f,new Date(value).toISOString()];
 return [f,value??null];
}));}
function changes(old,newer){const a=snapshot(old),b=snapshot(newer);return Object.fromEntries(FIELDS.filter(f=>JSON.stringify(a[f])!==JSON.stringify(b[f])).map(f=>[f,{old:a[f],new:b[f]}]));}
module.exports={normalise,localToInstant,parts,snapshot,changes,FIELDS,LIMITS,fail};
