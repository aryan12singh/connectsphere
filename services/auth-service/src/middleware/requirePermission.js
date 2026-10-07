// Permission-based access control (RBAC). Use AFTER requireAuth.
//
// Routes check a PERMISSION, not a role name. Roles get permissions through
// the role_permissions table, which tech support can edit. So if the
// customer decides venue staff may also confirm events, tech support ticks a
// box — no code change.
//
// Example — only users whose role has "event_requests.review":
//   router.post('/event-requests/:id/decision',
//     requireAuth,
//     requirePermission('event_requests.review'),
//     handler);
//
// Every permission name must exist in src/lib/permissions.js. A typo would
// silently block everyone, so we check at start-up and crash loudly instead.
const { isKnownPermission } = require('../lib/permissions');
const { hasPermission } = require('../../../utils/role-policy');

function requirePermission(permission) {
  if (!isKnownPermission(permission)) {
    throw new Error(`requirePermission: unknown permission "${permission}" — add it to src/lib/permissions.js`);
  }

  return (req, res, next) => {
    if (!hasPermission({ ...req.user, permissions: req.permissions }, permission)) {
      // 403 = "we know who you are, but you're not allowed to do this".
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { requirePermission };
