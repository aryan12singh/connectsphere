// Catalogue bundle definitions: projector includes its screen, stage includes a
// podium. Other/streaming needs require an explicit, versioned TS classification.
const mappings={projector:['projector'],microphone:['microphone'],speaker:['speaker'],lighting:['lighting'],stage:['stage'],'projector & screen':['projector'],'pa system & microphones':['speaker','microphone'],'staging / podium':['stage']};
function unknownNeeds(context){return (context.equipmentNeeds||[]).filter(need=>!mappings[String(need).trim().toLowerCase()]);}
function missingCoverage(context,requirements,resolution){
 const missing=[];
 for(const need of context.equipmentNeeds||[]){
  const types=mappings[String(need).trim().toLowerCase()];
  if(types){for(const type of types)if(!requirements.equipment.some(line=>line.equipmentType===type&&line.quantity>0))missing.push(type);}
  else {
   const item=resolution?.requirementsRevision===context.requirementsRevision&&resolution.entries?.find(item=>item.need===need);
   if(!item||!item.note?.trim()||!['SUPPORT_ONLY','EQUIPMENT'].includes(item.mode))missing.push(String(need));
   else if(item.mode==='SUPPORT_ONLY'&&(!requirements.supportRequired||!requirements.supportDetails?.trim()))missing.push(String(need));
   else if(item.mode==='EQUIPMENT'&&(!item.equipmentTypes?.length||item.equipmentTypes.some(type=>!requirements.equipment.some(line=>line.equipmentType===type&&line.quantity>0))))missing.push(String(need));
  }
 }
 if(String(context.technicalDetails||'').trim()&&(!requirements.supportRequired||!String(requirements.supportDetails||'').trim()))missing.push('technical support plan');
 return [...new Set(missing)];
}
function resolveCoverage(context,requirements,input,actor){
 const unknown=unknownNeeds(context);
 if(!unknown.length)return {requirementsRevision:context.requirementsRevision,entries:[],reviewedById:actor.id,reviewedAt:new Date().toISOString()};
 if(!Array.isArray(input)||input.length!==unknown.length)return null;
 const entries=[];
 for(const need of unknown){
  const matches=input.filter(item=>item?.need===need),item=matches[0];
  if(matches.length!==1||typeof item.note!=='string'||item.note.trim().length<10||item.note.length>2000||!['SUPPORT_ONLY','EQUIPMENT'].includes(item.mode))return null;
  const equipmentTypes=item.mode==='EQUIPMENT'&&Array.isArray(item.equipmentTypes)?[...new Set(item.equipmentTypes)]:[];
  entries.push({need,mode:item.mode,note:item.note.trim(),equipmentTypes});
 }
 const resolution={requirementsRevision:context.requirementsRevision,entries,reviewedById:actor.id,reviewedAt:new Date().toISOString()};
 return missingCoverage(context,requirements,resolution).length?null:resolution;
}
module.exports={missingCoverage,unknownNeeds,resolveCoverage};
