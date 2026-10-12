const express=require('express');
const {internalOnly}=require('../auth');
const store=require('../store');
const router=express.Router();
// booking-service holds the shared venue commitment lock through this call.
// This namespace is not routed by Kong.
router.delete('/venues/:id',internalOnly,async(req,res)=>{
  const removed=await store.deleteVenue(req.params.id);
  return removed?res.status(204).end():res.status(404).json({error:'Venue not found'});
});
module.exports=router;
