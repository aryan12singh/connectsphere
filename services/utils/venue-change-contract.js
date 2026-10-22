// The same bounded proposal crosses Event review and Booking validation.
const {createHash}=require('node:crypto');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function proposal(input,action){
 if(action==='CANCEL')return {};
 return Object.fromEntries(['venueId','startAt','endAt','expectedAttendance','layout','facilities','accessibilityNeeds','required'].map(key=>[key,['facilities','accessibilityNeeds'].includes(key)?[...new Set(input[key]||[])].sort():['startAt','endAt'].includes(key)?new Date(input[key]).toISOString():input[key]??(key==='required'?true:null)]));
}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
module.exports={proposal,fingerprint};
