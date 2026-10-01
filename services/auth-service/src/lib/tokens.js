// Session token helpers.
//
// A session token is 32 random bytes (256 bits) — impossible to guess.
// We give the plain token to the client once, at login, and store only its
// SHA-256 hash. When a request comes in, we hash the token it carries and
// look that hash up. Same approach as the seed data in 02_auth_db.sql.
//
// SHA-256 (not bcrypt) is fine here because the token is already long and
// random; slow hashing is only needed for human-chosen passwords.
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateToken, hashToken };
