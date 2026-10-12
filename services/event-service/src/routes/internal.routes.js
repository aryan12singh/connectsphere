const express = require('express');
const { internalOnly } = require('../auth');
const repository = require('../store');
const { toEvent } = require('../serializers');

// Read-only planning proof. Event identity, lifecycle and current assignment
// remain owned here; booking-service never reads the Event database directly.
const router = express.Router();
router.use(internalOnly);
router.get('/events/:id/planning-context', async (req, res, next) => {
  try {
    const [event] = await repository.listEvents({ id: req.params.id });
    const request = event && await repository.findRequest(event.eventRequestId);
    if (!request) return res.status(404).json({ error:{code:'NOT_FOUND',message:'Event not found'} });
    return res.json({ ...toEvent(event), requestVersion:request.version,
      currentCoordinatorId:request.currentCoordinatorId || null,
      expectedAttendance:request.expectedAttendance, minimumCapacity:request.minimumCapacity,
      preferredLayout:request.preferredLayout, venueType:request.venueType,
      venueRequirements:request.venueRequirements || '', accessibilityNeeds:request.accessibilityNeeds || [],
      accessibilityDetails:request.accessibilityDetails || '', equipmentNeeds:request.equipmentNeeds || [],
      technicalDetails:request.technicalDetails || '',
    });
  } catch (error) { next(error); }
});
module.exports = router;
