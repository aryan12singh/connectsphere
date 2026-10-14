const express = require('express');
const { internalOnly } = require('../auth');
const store = require('../store');
const workflows = require('../workflows');
const {venueContext,removeVenue}=require('../venueClient');

const router = express.Router();
router.get('/buffer-status/:venueId',internalOnly,async(req,res)=>res.json(await require('../legacyBuffers').bufferStatus(req.params.venueId)));
router.get('/legacy-buffer-context/:venueId',internalOnly,async(req,res)=>res.json(await require('../legacyBuffers').preview(req.params.venueId)));
router.put('/buffer-fence-recovery/:venueId',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.input?.version) || req.body.input.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current version and verified actor required'}});
  return res.json(await require('../legacyBuffers').recoverFence(req.params.venueId,req.body));
});
router.put('/legacy-buffers/:venueId',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.version) || req.body.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current version and verified actor required'}});
  return res.json(await require('../legacyBuffers').configure(req.params.venueId,req.body));
});
router.post('/venue-removals/:venueId',internalOnly,async(req,res)=>{
  if (typeof req.body?.actor?.id!=='string' || typeof req.body?.actor?.role!=='string') return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Verified actor is required'}});
  const result=await store.withLocks([workflows.venueLock(req.params.venueId)],async tx=>{
    const venue=await venueContext(req.params.venueId),at=await store.transactionNow(tx);
    const count=(await store.listBookings(tx,{venueId:venue.id})).filter(row=>workflows.effective(row,at) && Date.parse(workflows.windowFor(row,venue).endAt)>=at.getTime()).length;
    if(count) return {venueId:venue.id,blockingCount:count,deleted:false};
    return {venueId:venue.id,blockingCount:0,deleted:await removeVenue(venue.id,venue.version)};
  });
  return res.status(result.blockingCount?409:result.deleted?200:404).json(result);
});
router.post('/venue-rechecks',internalOnly,async(req,res)=>{
  const body=req.body || {};
  if (typeof body.venueId!=='string' || !body.venueId.trim() || !Number.isSafeInteger(body.version) || body.version<1 || !body.actor?.id || !body.actor?.role || typeof body.reason!=='string' || !body.reason.trim()) return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Use a versioned venue change with actor and reason'}});
  return res.json(await workflows.recheck(body));
});

router.get('/venue-links/:venueId', internalOnly, async (req, res) => {
  const blockingCount = await store.countBlockingBookings(req.params.venueId);
  return res.json({
    venueId: req.params.venueId,
    blockingCount,
    statuses: ['TENTATIVELY_HELD', 'CONFIRMED'],
  });
});

module.exports = router;
