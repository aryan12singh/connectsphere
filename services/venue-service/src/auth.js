const config = require('./config');
const path = require('node:path');

const ROLE_PERMISSIONS = require(
  process.env.ROLE_PERMISSIONS_PATH || path.resolve(__dirname, '../../utils/role-permissions'),
);

function testActor(req) {
  if (!config.isTest && process.env.AUTH_MODE !== 'mock') return null;
  const id = req.get('x-test-user-id');
  const role = req.get('x-test-role');
  if (!id || !role) return null;
  return { id, role, permissions: ROLE_PERMISSIONS[role] || [] };
}

async function resolveActor(req) {
  const local = testActor(req);
  if (local) return local;
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${config.authServiceUrl}/internal/sessions/validate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': config.internalApiKey,
    },
    body: JSON.stringify({ token: authorization.slice(7) }),
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (!result.valid || !result.user || !Array.isArray(result.permissions)) return null;
  return { ...result.user, permissions: result.permissions };
}

function requireAuth() {
  return async (req, res, next) => {
    try {
      req.actor = await resolveActor(req);
      if (!req.actor) return res.status(401).json({ error: 'Not logged in or session has expired' });
      return next();
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.actor.permissions.includes(permission)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    return next();
  };
}

function internalOnly(req, res, next) {
  if (req.get('x-internal-api-key') !== config.internalApiKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = { ROLE_PERMISSIONS, resolveActor, requireAuth, requirePermission, internalOnly };
