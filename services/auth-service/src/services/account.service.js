// Creating an account: used by both tech support (POST /admin/users) and
// self sign-up (POST /auth/register), so both follow exactly the same rules.
//
// An account has two halves that must stay in step:
//   1. the Keycloak login (email + password, lockout, password rules)
//   2. the user-service profile (name, role, company, active flag)
// Keycloak goes first because it rejects the common bad input (weak
// password, email already used) before anything is written. If the profile
// step then fails, the Keycloak login is deleted again, so we never leave a
// login with no profile behind it.
const { ROLES } = require('../lib/permissions');
const userService = require('../clients/userService');
const keycloakAdmin = require('../clients/keycloakAdmin');

// Simple email shape check. Keycloak and user-service check again.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Is `value` a non-empty string no longer than `max`?
function isText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/**
 * Checks the input for a new account.
 * @param input { email, firstName, lastName, role, company?, password }
 * @returns {{ error: string } | { profile, password }}
 */
function validateNewAccount(input) {
  const { email, firstName, lastName, role, company, password } = input || {};

  if (!isText(email, 254) || !EMAIL_PATTERN.test(email.trim())) {
    return { error: 'A valid email is required' };
  }
  if (!isText(firstName, 100) || !isText(lastName, 100)) {
    return { error: 'First and last name are required (max 100 characters)' };
  }
  if (!ROLES.includes(role)) {
    return { error: `Role must be one of: ${ROLES.join(', ')}` };
  }
  if (company !== undefined && company !== null && company !== '' && !isText(company, 200)) {
    return { error: 'Company must be text (max 200 characters)' };
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return { error: 'A password is required (max 128 characters)' };
  }

  return {
    profile: {
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      company: company ? company.trim() : null,
    },
    password,
  };
}

/**
 * Creates the Keycloak login and the user-service profile.
 * Throws KeycloakInputError / UserServiceError (with .status) for bad input,
 * e.g. 400 weak password or 409 email already used.
 * @returns the new user-service profile
 */
async function createAccount(profile, password) {
  // Step 1: Keycloak login. Fails early on a weak password or a used email.
  const keycloakId = await keycloakAdmin.createUser({ ...profile, password });

  // Step 2: user-service profile. If this fails, undo step 1.
  try {
    return await userService.createUser(profile);
  } catch (err) {
    await keycloakAdmin.deleteUser(keycloakId).catch((undoErr) =>
      console.error(`Could not undo Keycloak user ${keycloakId}:`, undoErr.message));
    throw err;
  }
}

module.exports = { validateNewAccount, createAccount };
