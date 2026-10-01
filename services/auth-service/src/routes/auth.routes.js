// Public auth routes. Kong exposes these as /auth/login, /auth/logout, /auth/me.
const express = require('express');
const keycloak = require('../clients/keycloak');
const userService = require('../clients/userService');
const sessionService = require('../services/session.service');
const permissionService = require('../services/permission.service');
const accountService = require('../services/account.service');
const settingsService = require('../services/settings.service');
const audit = require('../services/audit.service');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// One message for every login failure (wrong password, unknown email,
// locked or disabled account) so attackers can't discover which emails
// are registered.
const LOGIN_FAILED = { error: 'Invalid email or password' };

// POST /auth/login   body: { "email": "...", "password": "..." }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  // 1. Basic input checks. Length caps stop someone sending a huge password.
  if (
    typeof email !== 'string' || typeof password !== 'string' ||
    !email.trim() || !password ||
    email.length > 254 || password.length > 128
  ) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const normalisedEmail = email.trim().toLowerCase();

  // 2. Ask Keycloak whether the password is right (Keycloak also applies lockout).
  let passwordOk;
  try {
    passwordOk = await keycloak.checkPassword(normalisedEmail, password);
  } catch (err) {
    console.error('Keycloak check failed:', err.message);
    return res.status(503).json({ error: 'Login is temporarily unavailable. Please try again shortly.' });
  }
  if (!passwordOk) {
    return res.status(401).json(LOGIN_FAILED);
  }

  // 3. Find the matching ConnectSphere user (profile + role).
  const user = await userService.findUserByEmail(normalisedEmail);
  if (!user) {
    // Keycloak knows this person but user_db doesn't — the two are out of sync.
    console.warn(`Login: ${normalisedEmail} exists in Keycloak but not in user-service`);
    return res.status(401).json(LOGIN_FAILED);
  }
  if (!user.isActive) {
    // Disabling also turns the account off in Keycloak, so this is a backstop.
    return res.status(401).json(LOGIN_FAILED);
  }

  // 4. Start a session and hand back the token, plus what this user may do
  //    (the frontend uses `permissions` to decide which screens to show).
  const { token, expiresAt } = await sessionService.createSession(user.id);
  const permissions = await permissionService.getPermissionsForRole(user.role);
  res.status(200).json({ token, expiresAt, user, permissions });
});

// POST /auth/logout   header: Authorization: Bearer <token>
router.post('/logout', requireAuth, async (req, res) => {
  await sessionService.revokeSession(req.session.id);
  res.status(204).end();
});

// GET /auth/me   header: Authorization: Bearer <token>
// Returns who is logged in, their role and permissions (the frontend uses
// these to decide which screens and buttons to show).
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, permissions: req.permissions, expiresAt: req.session.expiresAt });
});

// POST /auth/register   body: { email, firstName, lastName, company?, password }
// Self sign-up (decided 2026-10-01): creates an ATTENDEE that can log in
// straight away. The role is fixed here — anything sent in the body is
// ignored — so nobody can sign themselves up as staff. Staff accounts are
// created by tech support (POST /admin/users).
// Kong rate-limits this route, like login.
router.post('/register', async (req, res) => {
  const { email, firstName, lastName, company, password } = req.body || {};
  const checked = accountService.validateNewAccount({ email, firstName, lastName, company, password, role: 'ATTENDEE' });
  if (checked.error) {
    return res.status(400).json({ error: checked.error });
  }

  // Errors such as a weak password (400) or an email already used (409)
  // come back from createAccount with a readable message.
  const user = await accountService.createAccount(checked.profile, checked.password);
  // The new user is the "actor": nobody else was involved.
  await audit.record(user.id, audit.ACTIONS.USER_REGISTERED, user.id, { email: user.email, role: user.role, via: 'sign-up' });

  // No session is created: the user goes to the login page next.
  res.status(201).json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } });
});

// GET /auth/password-policy
// The current password rules, so the sign-up page can show them before the
// user types. Public: the rules are not secret. Set by tech support in
// PUT /admin/settings.
router.get('/password-policy', async (req, res) => {
  const s = await settingsService.getSettings();
  res.json({
    minLength: s.passwordMinLength,
    requireUppercase: s.passwordRequireUppercase,
    requireLowercase: s.passwordRequireLowercase,
    requireDigit: s.passwordRequireDigit,
    requireSpecial: s.passwordRequireSpecial,
    notEmail: true, // Keycloak also rejects a password equal to the email
  });
});

module.exports = router;
