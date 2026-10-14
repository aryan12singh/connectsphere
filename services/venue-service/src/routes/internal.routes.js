const express=require('express');
const {internalOnly}=require('../auth');
const store=require('../store');
const router=express.Router();
router.put('/venues/:id/buffer-fence-recovery',internalOnly,async(req,res)=>{
  const {validateVenue}=require('../validation'),input=req.body?.input;
  if(!input || Object.keys(validateVenue(input)).length || !Number.isSafeInteger(input.version) || input.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Valid venue input, current version and verified actor required'}});
  const venue=await store.replaceVenue(req.params.id,input,req.body.actor,{recoverFence:true});
  return venue?res.json(venue):res.status(404).json({error:'Venue not found'});
});
router.put('/venues/:id/legacy-buffers',internalOnly,async(req,res)=>{
  const errors=require('../validation').validateLegacyBuffers(req.body);
  if(Object.keys(errors).length || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Valid buffers, communication, version and actor required'}});
  const venue=await store.configureLegacyBuffers(req.params.id,req.body,req.body.actor);
  return venue?res.json(venue):res.status(404).json({error:'Venue not found'});
});
// booking-service holds the shared venue commitment lock through this call.
// This namespace is not routed by Kong.
router.delete('/venues/:id',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.version) || req.body.version<1)return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current checked venue version is required'}});
  const removed=await store.deleteVenue(req.params.id,req.body.version);
  return removed?res.status(204).end():res.status(404).json({error:'Venue not found'});
});
router.post('/venues/:id/buffer-lock',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.version) || req.body.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current version and verified actor required'}});
  const venue=await store.lockBuffers(req.params.id,req.body.version,req.body.actor);
  return venue?res.json(venue):res.status(404).json({error:'Venue not found'});
});
module.exports=router;
