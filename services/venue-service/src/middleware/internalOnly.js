// Blocks any request that doesn't carry the internal API key.
//
// Why: /internal/* routes return user data (including role) without a
// logged-in user. They are meant for other services only, e.g. auth-service
// looking up a user during login. Kong never routes /internal/* to the
// outside world, and this key is a second lock in case it ever does.
const crypto = require('crypto');
const config = require('../config');

// Compare two strings in constant time so an attacker can't guess the key
// one character at a time by measuring response times.
function safeEqual(a, b) {
  const bufA = Buffer.from(a || '');
  const bufB = Buffer.from(b || '');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function internalOnly(req, res, next) {
  if (!safeEqual(req.get('x-internal-api-key'), config.internalApiKey)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = internalOnly;
