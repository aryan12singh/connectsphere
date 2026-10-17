const config = require('./config');
const {rolesForUser,hasPermission}=require('../../utils/role-policy');
const defaults=require('../../utils/role-permissions');

function testActor(req) {
  if (!config.isTest && process.env.AUTH_MODE !== 'mock') return null;
  const id = req.get('x-test-user-id');
  const role = req.get('x-test-role');
  if (!id || !role) return null;
  const permittedEventIds = (req.get('x-test-event-access') || '').split(',').filter(Boolean);
  return { id, role, roles:[role], permissions:defaults[role]||[],permittedEventIds };
}

async function resolveActor(req) {
  const local = testActor(req);
  if (local) return local;
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${config.authServiceUrl}/internal/sessions/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-api-key': config.internalApiKey },
    body: JSON.stringify({ token: authorization.slice(7) }),
    signal:AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (!result.valid || !result.user || result.user.isActive===false) return null;
  if(!Array.isArray(result.permissions))throw Error('Trusted capabilities missing');
  if(!rolesForUser(result.user).length)throw Error('No recognised role');
  return { ...result.user, permissions: Array.isArray(result.permissions) ? result.permissions : [] };
}

function requireAuth() {
  return async (req, res, next) => {
    try {
      req.actor = await resolveActor(req);
      if (!req.actor) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in or session has expired' } });
      return next();
    }
    catch { return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication service unavailable' } }); }
  };
}

function requireRole(...roles) {
  return (req,res,next)=>{
    const capability=roles.length>1?'technical.view':roles[0]==='EVENT_COORDINATOR'?'technical.submit':'technical.review';
    if(rolesForUser(req.actor).some(role=>roles.includes(role))&&hasPermission(req.actor,capability))return next();
    return res.status(403).json({error:{code:'FORBIDDEN',message:'You do not have permission to do this'}});
  };
}
module.exports = { requireAuth, requireRole };
