// Public auth routes. Kong exposes these as /auth/login, /auth/logout, /auth/me.
const express = require('express');
const keycloak = require('../clients/keycloak');
const userService = require('../clients/userService');
const sessionService = require('../services/session.service');
const permissionService = require('../services/permission.service');
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

module.exports = router;
