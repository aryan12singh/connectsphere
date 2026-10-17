const express = require('express');
const { internalOnly } = require('../auth');
const repository = require('../store');
const { toEvent } = require('../serializers');

// Read-only planning proof. Event identity, lifecycle and current assignment
// remain owned here; booking-service never reads the Event database directly.
const router = express.Router();
router.use(internalOnly);
router.post('/events/:id/readiness-invalidations',async(req,res,next)=>{
 try{if(typeof req.body?.token!=='string'||!req.body.token)return res.status(422).json({error:{code:'VALIDATION_FAILED',message:'Exact readiness token required'}});return res.json(await require('../safety').invalidate(req.params.id,req.body.token,req.body.reason));}catch(error){next(error);}
});
router.get('/requests/:id/technical-context',async(req,res,next)=>{
 try{
  const request=await repository.findRequest(req.params.id);
  const [event]=request?await repository.listEvents({eventRequestId:request.id}):[];
  if(!request||!event)return res.status(404).json({error:{code:'NOT_FOUND',message:'Planning Event not found'}});
  return res.json({eventId:event.id,eventRequestId:request.id,currentCoordinatorId:request.currentCoordinatorId,status:event.status,requestVersion:request.version,equipmentNeeds:request.equipmentNeeds||[],technicalDetails:request.technicalDetails||'',startAt:event.startAt,endAt:event.endAt,safetyState:event.safetyState||'NOT_SUBMITTED',safetyToken:event.safetyToken||null,safetyGeneration:event.safetyGeneration||0,requirementsRevision:require('../safety').revision(event,request)});
 }catch(error){next(error);}
});
router.get('/requests/:id/notification-context',async(req,res,next)=>{
 try{
  const request=await repository.findRequest(req.params.id);
  if(!request||request.status==='DRAFT')return res.status(404).json({error:{code:'NOT_FOUND',message:'Request not found'}});
  return res.json({eventRequestId:request.id,organiserId:request.organiserId,currentCoordinatorId:request.currentCoordinatorId||null,title:request.eventName,status:request.status,requestVersion:request.version});
 }catch(error){next(error);}
});
router.get('/events/:id/planning-context', async (req, res, next) => {
  try {
    const [event] = await repository.listEvents({ id: req.params.id });
    const request = event && await repository.findRequest(event.eventRequestId);
    if (!request) return res.status(404).json({ error:{code:'NOT_FOUND',message:'Event not found'} });
    return res.json({ ...toEvent(event), requestVersion:request.version,
      currentCoordinatorId:request.currentCoordinatorId || null,
      technicalRequirementsRevision:require('../safety').revision(event,request),
      safetyRoundId:event.safetyRoundId||null,safetyToken:event.safetyToken||null,safetyState:event.safetyState||'NOT_SUBMITTED',safetyGeneration:event.safetyGeneration||0,safetyRework:event.safetyRework||null,
      expectedAttendance:request.expectedAttendance, minimumCapacity:request.minimumCapacity,
      preferredLayout:request.preferredLayout, venueType:request.venueType,
      venueRequirements:request.venueRequirements || '', accessibilityNeeds:request.accessibilityNeeds || [],
      accessibilityDetails:request.accessibilityDetails || '', equipmentNeeds:request.equipmentNeeds || [],
      technicalDetails:request.technicalDetails || '',
    });
  } catch (error) { next(error); }
});
module.exports = router;
