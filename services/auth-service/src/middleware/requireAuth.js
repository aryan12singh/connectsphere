// Protects a route: only lets the request through if it carries a valid
// session token in the header  `Authorization: Bearer <token>`.
//
// On success it sets:
//   req.user        — { id, email, firstName, lastName, role, company, isActive }
//   req.permissions — e.g. ["events.view", "attendance.register"]
//   req.session     — the session row (used by logout)
const { resolveToken } = require('../services/session.service');

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function requireAuth(req, res, next) {
  const result = await resolveToken(readBearerToken(req));
  if (!result) {
    // Same message for missing, wrong, expired, idle, logged-out and
    // disabled, so callers learn nothing about which it was.
    return res.status(401).json({ error: 'Not logged in or session has expired' });
  }

  req.user = result.user;
  req.permissions = result.permissions;
  req.session = result.session;
  next();
}

module.exports = { requireAuth, readBearerToken };
