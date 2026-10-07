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
const { PUBLIC_ROLES } = require('../../../utils/role-policy');
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
function validateNewAccount(input, policy = {}) {
  const { email, firstName, lastName, company, password } = input || {};
  const role = input?.role === undefined ? 'ATTENDEE' : input.role;
  const fields = {};
  if (!isText(email, 254) || !EMAIL_PATTERN.test(email.trim())) fields.email = ['A valid email is required'];
  if (!isText(firstName, 100)) fields.firstName = ['First name is required (max 100 characters)'];
  if (!isText(lastName, 100)) fields.lastName = ['Last name is required (max 100 characters)'];
  if (!PUBLIC_ROLES.includes(role)) fields.role = ['Only Organiser and Attendee accounts may be created; staff roles are seed-only'];
  if (role === 'EVENT_ORGANISER' && !isText(company, 200)) fields.company = ['Organisation is required (max 200 characters)'];
  else if (company !== undefined && company !== null && company !== '' && !isText(company, 200)) fields.company = ['Organisation must be text (max 200 characters)'];
  const minLength = policy.passwordMinLength ?? 8;
  if (typeof password !== 'string' || password.length < minLength || password.length > 128) fields.password = [`Password must contain ${minLength} to 128 characters`];
  else {
    const rules = [
      [policy.passwordRequireUppercase ?? true, /[A-Z]/, 'an uppercase letter'],
      [policy.passwordRequireLowercase ?? true, /[a-z]/, 'a lowercase letter'],
      [policy.passwordRequireDigit ?? true, /\d/, 'a number'],
      [policy.passwordRequireSpecial ?? true, /[^A-Za-z0-9]/, 'a symbol'],
    ];
    for (const [required, pattern, label] of rules) if (required && !pattern.test(password)) (fields.password ??= []).push(`Password must include ${label}`);
    if (typeof email === 'string' && password.toLowerCase() === email.trim().toLowerCase()) (fields.password ??= []).push('Password must differ from your email');
  }
  if (Object.keys(fields).length) return { error: 'Account contains invalid fields', fields };
  return {
    profile: { email: email.trim().toLowerCase(), firstName: firstName.trim(), lastName: lastName.trim(), role, company: company ? company.trim() : null },
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
