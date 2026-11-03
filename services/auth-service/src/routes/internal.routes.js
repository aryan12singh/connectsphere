// Internal routes: for other ConnectSphere services, never the browser.
// Kong does not route /internal/*, and internalOnly checks the shared key.
const express = require('express');
const internalOnly = require('../middleware/internalOnly');
const { resolveToken } = require('../services/session.service');
const { rolesForUser } = require('../../../utils/role-policy');
const userService = require('../clients/userService');
const keycloakAdmin = require('../clients/keycloakAdmin');
const eventService = require('../clients/eventService');
const sessionService = require('../services/session.service');
const audit = require('../services/audit.service');

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

// PATCH /internal/users/:id/status   body: { isActive: false | true }
// Controlled account setup (CS-10, CS-24 T02): there is no in-app user
// administration, so deactivation is an operator command with the internal
// key. Disabling blocks login (Keycloak) and ends the user's sessions.
// Session 3: the Lead reassigns every open Event before a Coordinator is
// deactivated, so a Coordinator with open requests is refused. If
// event-service cannot answer, refuse rather than guess.
router.patch('/users/:id/status', async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
  const existing = await userService.findUserById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (!isActive && (existing.roles ?? [existing.role]).includes('EVENT_COORDINATOR')) {
    let open;
    try { open = await eventService.openAssignments(existing.id); }
    catch (error) {
      console.error(`Open assignment check for ${existing.id} failed:`, error.message);
      return res.status(503).json({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Could not check this Coordinator\'s open Events. Try again later.' } });
    }
    if (open.count > 0) {
      return res.status(409).json({ error: { code: 'COORDINATOR_HAS_OPEN_EVENTS', message: `This Coordinator still has ${open.count} open event request(s). Ask the Coordinator Lead to reassign them first.`, requests: open.requests } });
    }
  }

  // Keycloak first: this is what actually blocks the password check.
  const keycloakId = await keycloakAdmin.findUserIdByEmail(existing.email);
  if (keycloakId) await keycloakAdmin.setUserEnabled(keycloakId, isActive);
  else console.warn(`Status change: ${existing.email} has no Keycloak account`);

  const user = await userService.updateUser(req.params.id, { isActive });
  if (!isActive) await sessionService.revokeAllSessionsForUser(user.id);
  await audit.record('controlled-setup', isActive ? audit.ACTIONS.USER_ENABLED : audit.ACTIONS.USER_DISABLED, user.id, { email: user.email });
  res.json(user);
});

module.exports = router;
