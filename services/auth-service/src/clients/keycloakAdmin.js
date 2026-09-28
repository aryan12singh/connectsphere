// Talks to Keycloak's ADMIN API — the part that manages accounts and realm
// settings (not the login check; that's clients/keycloak.js).
//
// auth-service logs in to the admin API as its own "service account" using
// the client id + secret (client credentials grant). The realm file gives
// that service account exactly three admin roles: view-users, manage-users
// and manage-realm.
const config = require('../config');

const BASE = `${config.keycloak.url}/admin/realms/${config.keycloak.realm}`;
const TOKEN_URL = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/token`;

// Cached admin access token, reused until shortly before it expires.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAdminToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.keycloak.clientId,
      client_secret: config.keycloak.clientSecret,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin login failed with ${response.status}`);
  }
  const body = await response.json();
  cachedToken = body.access_token;
  // Refresh 30 seconds early so we never send an expired token.
  cachedTokenExpiresAt = Date.now() + (body.expires_in - 30) * 1000;
  return cachedToken;
}

// Small helper: calls the admin API and returns the raw response.
async function adminFetch(path, options = {}) {
  const token = await getAdminToken();
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(5000),
  });
}

// Thrown when Keycloak rejects something the admin typed (e.g. a weak
// password). The route turns it into a 400/409 with this message.
class KeycloakInputError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Creates a Keycloak account that can log in straight away.
 * @returns {Promise<string>} the new Keycloak user id
 */
async function createUser({ email, firstName, lastName, password }) {
  const response = await adminFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      // Not "temporary": a temporary password would force a password change
      // screen, which our login form can't show yet.
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  });

  if (response.status === 409) {
    throw new KeycloakInputError(409, 'A user with this email already exists');
  }
  if (response.status === 400) {
    // Keycloak's 400 here is almost always the password policy.
    throw new KeycloakInputError(400, 'Password does not meet the password rules');
  }
  if (!response.ok) {
    throw new Error(`Keycloak create user failed with ${response.status}`);
  }
  // Keycloak returns the new user's URL in the Location header; the id is the last part.
  return response.headers.get('location').split('/').pop();
}

// Returns the Keycloak user id for an email, or null.
async function findUserIdByEmail(email) {
  const response = await adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`);
  if (!response.ok) {
    throw new Error(`Keycloak user search failed with ${response.status}`);
  }
  const users = await response.json();
  return users.length > 0 ? users[0].id : null;
}

// Turns login on/off for an account.
async function setUserEnabled(keycloakUserId, enabled) {
  const response = await adminFetch(`/users/${keycloakUserId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    throw new Error(`Keycloak enable/disable failed with ${response.status}`);
  }
}

// Removes an account. Only used to undo a half-finished "create user".
async function deleteUser(keycloakUserId) {
  await adminFetch(`/users/${keycloakUserId}`, { method: 'DELETE' });
}

// Builds Keycloak's password policy string from our settings, e.g.
// "length(8) and upperCase(1) and digits(1) and notUsername".
function buildPasswordPolicy(settings) {
  const rules = [`length(${settings.passwordMinLength})`];
  if (settings.passwordRequireUppercase) rules.push('upperCase(1)');
  if (settings.passwordRequireLowercase) rules.push('lowerCase(1)');
  if (settings.passwordRequireDigit) rules.push('digits(1)');
  if (settings.passwordRequireSpecial) rules.push('specialChars(1)');
  rules.push('notUsername'); // password can never be the email itself
  return rules.join(' and ');
}

// Copies the lockout and password rules from our settings into Keycloak.
// Keycloak only changes the fields we send.
async function applySecuritySettings(settings) {
  const response = await adminFetch('', {
    method: 'PUT',
    body: JSON.stringify({
      bruteForceProtected: true,
      permanentLockout: false,
      failureFactor: settings.lockoutMaxFailures,
      waitIncrementSeconds: settings.lockoutWaitMinutes * 60,
      maxFailureWaitSeconds: settings.lockoutMaxWaitMinutes * 60,
      passwordPolicy: buildPasswordPolicy(settings),
    }),
  });
  if (!response.ok) {
    throw new Error(`Keycloak realm update failed with ${response.status}`);
  }
}

module.exports = {
  createUser,
  findUserIdByEmail,
  setUserEnabled,
  deleteUser,
  applySecuritySettings,
  buildPasswordPolicy,
  KeycloakInputError,
};
