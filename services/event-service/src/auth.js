const config = require('./config');
const path = require('node:path');
const { authenticate } = require('./identity');
const {hasPermission,rolesForUser}=require(path.resolve(process.env.SERVICE_UTILS_PATH||path.resolve(__dirname,'../../utils'),'role-policy'));
const ROLE_PERMISSIONS = require(process.env.ROLE_PERMISSIONS_PATH || path.resolve(__dirname, '../../utils/role-permissions'));

function testActor(req) {
  if (!config.isTest && process.env.AUTH_MODE !== 'mock') return null;
  const id = req.get('x-test-user-id');
  const role = req.get('x-test-role');
  if (!id || !role) return null;
  return { id, role, permissions: ROLE_PERMISSIONS[role] || [] };
}

// Real path: ask auth-service to validate the bearer token. identity.js fails
// closed (401 bad/expired session, 403 no recognised role, 503 if the
// permission list is missing or malformed) and never falls back to roles.
function requireAuth() {
  return async (req, res, next) => {
    const local = testActor(req);
    if (local) { req.actor = local; return next(); }
    // identity.authenticate reports problems through next(error); turn them
    // into the standard JSON error body so every caller sees the same shape.
    return authenticate(req, res, (error) => {
      if (!error) return next();
      const status = error.status || 500;
      if (status >= 500 && status !== 503) console.error('event-service auth error', error.code || error.name);
      return res.status(status).json({ error: { code: error.code || 'INTERNAL', message: status === 500 ? 'Unable to check access. Please retry.' : error.message } });
    });
  };
}

// Caller must hold EVERY listed permission (missing one => 403).
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!permissions.every((permission) => hasPermission(req.actor,permission))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    }
    return next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.some(role=>rolesForUser(req.actor).includes(role))) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    return next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!permissions.some((permission) => hasPermission(req.actor,permission))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    }
    return next();
  };
}

function internalOnly(req, res, next) {
  if (req.get('x-internal-api-key') !== config.internalApiKey) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
  return next();
}

module.exports = { ROLE_PERMISSIONS, requireAuth, requireRole, requireAnyPermission, requirePermission, internalOnly };
