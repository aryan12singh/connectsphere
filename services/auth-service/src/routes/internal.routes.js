// Internal routes: for other ConnectSphere services, never the browser.
// Kong does not route /internal/*, and internalOnly checks the shared key.
const express = require('express');
const internalOnly = require('../middleware/internalOnly');
const { resolveToken } = require('../services/session.service');
const { rolesForUser } = require('../../../utils/role-policy');

const router = express.Router();
router.use(internalOnly);

// POST /internal/sessions/validate   body: { "token": "..." }
// How other services check a caller: event-service (for example) forwards
// the Bearer token here, gets back the user and their permissions, and
// checks the permission its route needs.
router.post('/sessions/validate', async (req, res) => {
  const token = req.body && req.body.token;
  const result = await resolveToken(typeof token === 'string' ? token : null);
  if (!result) {
    return res.status(401).json({ valid: false });
  }
  if (!rolesForUser(result.user).length) return res.status(403).json({ valid: false });
  res.json({
    valid: true,
    user: result.user,
    permissions: result.permissions,
    expiresAt: result.session.expiresAt,
  });
});

module.exports = router;
