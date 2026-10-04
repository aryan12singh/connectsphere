const express = require('express');
const { internalOnly } = require('../auth');
const store = require('../store');

const router = express.Router();

router.get('/venue-links/:venueId', internalOnly, async (req, res) => {
  const blockingCount = await store.countBlockingBookings(req.params.venueId);
  return res.json({
    venueId: req.params.venueId,
    blockingCount,
    statuses: ['TENTATIVELY_HELD', 'CONFIRMED'],
  });
});

module.exports = router;
