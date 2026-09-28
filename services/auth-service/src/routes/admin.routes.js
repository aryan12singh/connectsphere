// Admin routes for tech support: users, role permissions, settings and the
// audit log. Kong exposes these as /admin/...
//
// Every route needs a logged-in user (requireAuth) AND a specific
// permission (requirePermission). By default only TECHNICAL_SUPPORT_STAFF
// has the admin permissions — see the migration that seeds role_permissions.
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requirePermission');
const { ROLES, isKnownPermission } = require('../lib/permissions');
const userService = require('../clients/userService');
const keycloakAdmin = require('../clients/keycloakAdmin');
const sessionService = require('../services/session.service');
const permissionService = require('../services/permission.service');
const settingsService = require('../services/settings.service');
const audit = require('../services/audit.service');

const router = express.Router();
router.use(requireAuth); // every admin route needs a login

// Simple email shape check. Keycloak and user-service check again.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Is `value` a non-empty string no longer than `max`?
function isText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

// ── Users ────────────────────────────────────────────────────────────────

// GET /admin/users?search=tan&role=ATTENDEE&page=1
router.get('/users', requirePermission('users.view'), async (req, res) => {
  const { search, role, page } = req.query;
  res.json(await userService.listUsers({ search, role, page }));
});

// POST /admin/users   body: { email, firstName, lastName, role, company?, password }
// Creates the login (Keycloak) and the profile (user-service). The user can
// log in straight away with the password tech support set.
router.post('/users', requirePermission('users.manage'), async (req, res) => {
  const { email, firstName, lastName, role, company, password } = req.body || {};

  if (!isText(email, 254) || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!isText(firstName, 100) || !isText(lastName, 100)) {
    return res.status(400).json({ error: 'First and last name are required (max 100 characters)' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
  }
  if (company !== undefined && company !== null && !isText(company, 200)) {
    return res.status(400).json({ error: 'Company must be text (max 200 characters)' });
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return res.status(400).json({ error: 'An initial password is required (max 128 characters)' });
  }

  const profile = {
    email: email.trim().toLowerCase(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    role,
    company: company ? company.trim() : null,
  };

  // Step 1: Keycloak account. Fails early on a weak password or a used email.
  const keycloakId = await keycloakAdmin.createUser({ ...profile, password });

  // Step 2: user-service profile. If this fails, undo step 1 so we never
  // leave a Keycloak login with no ConnectSphere profile behind it.
  let user;
  try {
    user = await userService.createUser(profile);
  } catch (err) {
    await keycloakAdmin.deleteUser(keycloakId).catch((undoErr) =>
      console.error(`Could not undo Keycloak user ${keycloakId}:`, undoErr.message));
    throw err;
  }

  await audit.record(req.user.id, audit.ACTIONS.USER_CREATED, user.id, { email: user.email, role: user.role });
  res.status(201).json(user);
});

// PATCH /admin/users/:id/role   body: { role }
router.patch('/users/:id/role', requirePermission('users.manage'), async (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
  }
  // Stops an admin removing their own admin access by mistake, and means
  // there is always at least one tech support account left.
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  const existing = await userService.findUserById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const user = await userService.updateUser(req.params.id, { role });
  await audit.record(req.user.id, audit.ACTIONS.USER_ROLE_CHANGED, user.id, { from: existing.role, to: role });
  res.json(user);
});

// PATCH /admin/users/:id/status   body: { isActive: false | true }
// Disabling blocks login (in Keycloak) and ends all their open sessions.
router.patch('/users/:id/status', requirePermission('users.manage'), async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be true or false' });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot disable your own account' });
  }

  const existing = await userService.findUserById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Keycloak first: this is what actually blocks the password check.
  const keycloakId = await keycloakAdmin.findUserIdByEmail(existing.email);
  if (keycloakId) {
    await keycloakAdmin.setUserEnabled(keycloakId, isActive);
  } else {
    console.warn(`Status change: ${existing.email} has no Keycloak account`);
  }

  const user = await userService.updateUser(req.params.id, { isActive });
  if (!isActive) {
    await sessionService.revokeAllSessionsForUser(user.id);
  }

  const action = isActive ? audit.ACTIONS.USER_ENABLED : audit.ACTIONS.USER_DISABLED;
  await audit.record(req.user.id, action, user.id, { email: user.email });
  res.json(user);
});

// ── Role permissions ─────────────────────────────────────────────────────

// GET /admin/permissions
// The catalog of permissions, what each role has, and which can't be removed.
router.get('/permissions', requirePermission('permissions.manage'), async (req, res) => {
  res.json(await permissionService.getMatrix());
});

// PUT /admin/roles/:role/permissions   body: { permissions: ["events.view", ...] }
// Replaces the role's whole permission list with the one sent.
router.put('/roles/:role/permissions', requirePermission('permissions.manage'), async (req, res) => {
  const { role } = req.params;
  const { permissions } = req.body || {};

  if (!ROLES.includes(role)) {
    return res.status(404).json({ error: 'Unknown role' });
  }
  if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: 'permissions must be a list of permission names' });
  }
  const unknown = permissions.filter((p) => !isKnownPermission(p));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `Unknown permissions: ${unknown.join(', ')}` });
  }

  const { before, after } = await permissionService.setRolePermissions(role, permissions);
  await audit.record(req.user.id, audit.ACTIONS.ROLE_PERMISSIONS_CHANGED, role, { before, after });
  res.json({ role, permissions: after });
});

// ── Settings ─────────────────────────────────────────────────────────────

// GET /admin/settings
router.get('/settings', requirePermission('settings.manage'), async (req, res) => {
  res.json(await settingsService.getSettings());
});

// PUT /admin/settings   body: any of the settings, e.g. { "sessionTtlHours": 12 }
// Only the fields sent are changed.
router.put('/settings', requirePermission('settings.manage'), async (req, res) => {
  const changes = req.body || {};
  if (typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'Send at least one setting to change' });
  }

  const result = await settingsService.updateSettings(changes, req.user.id);
  if (result.errors) {
    return res.status(400).json({ error: 'Some settings are invalid', details: result.errors });
  }

  // Log only the fields that changed, as { field: { from, to } }.
  const changed = {};
  for (const key of Object.keys(changes)) {
    if (result.before[key] !== result.after[key]) changed[key] = { from: result.before[key], to: result.after[key] };
  }
  await audit.record(req.user.id, audit.ACTIONS.SETTINGS_UPDATED, 'auth_settings', changed);
  res.json(result.after);
});

// ── Audit log ────────────────────────────────────────────────────────────

// GET /admin/audit-logs?page=1
router.get('/audit-logs', requirePermission('audit.view'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  res.json(await audit.list(page));
});

module.exports = router;
