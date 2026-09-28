// Talks to Keycloak for one thing only: "is this email + password correct?"
//
// It uses Keycloak's "direct access grant" (password grant): we send the
// credentials straight to Keycloak's token endpoint. If Keycloak answers
// 200, the password is right. We don't keep Keycloak's tokens — auth-service
// issues its own session token instead (see services/session.service.js).
//
// Lockout: Keycloak's brute-force protection (configured in the realm file,
// infra/keycloak/connectsphere-realm.json) locks an account after too many
// wrong passwords. While locked, Keycloak rejects even the right password
// with the same "invalid credentials" error, so callers can't tell whether
// an account exists or is locked.
const config = require('../config');

const TOKEN_URL = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/token`;

/**
 * Checks an email + password against Keycloak.
 * @returns {Promise<boolean>} true if correct, false if wrong/locked/disabled.
 * @throws if Keycloak can't be reached or answers with an unexpected error —
 *         the caller turns that into "login temporarily unavailable".
 */
async function checkPassword(email, password) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: config.keycloak.clientId,
      client_secret: config.keycloak.clientSecret,
      username: email,
      password,
    }),
    signal: AbortSignal.timeout(5000), // don't hang the login request forever
  });

  if (response.ok) {
    return true;
  }

  // Keycloak answers 400/401 with { error: "invalid_grant" } for a wrong
  // password, an unknown user, a locked account or a disabled account.
  const body = await response.json().catch(() => ({}));
  if (body.error === 'invalid_grant') {
    return false;
  }

  // Anything else (bad client secret, realm missing, Keycloak down…) is a
  // setup problem, not the user's fault.
  throw new Error(`Keycloak token endpoint returned ${response.status}: ${JSON.stringify(body)}`);
}

module.exports = { checkPassword };
