// Internal routes: called by other services (auth-service for now), never by
// the browser. Every route here is protected by internalOnly.
//
// These routes don't check permissions themselves — auth-service checks
// that the caller is allowed (e.g. has "users.manage") before calling them.
const express = require('express');
const prisma = require('../db');
const internalOnly = require('../middleware/internalOnly');

const router = express.Router();
router.use(internalOnly);

// The fields we are willing to hand to other services.
// passwordHash is deliberately left out — it should never leave this service.
const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  company: true,
  isActive: true,
  createdAt: true,
};

const ROLES = ['EVENT_ORGANISER', 'EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'ATTENDEE'];

// GET /internal/users?search=tan&role=ATTENDEE&page=1
// Paged list for the tech support "Users" screen. 25 users per page.
router.get('/users', async (req, res) => {
  const PAGE_SIZE = 25;
  const page = Math.max(1, Number(req.query.page) || 1);
  const search = String(req.query.search || '').trim();
  const role = ROLES.includes(req.query.role) ? req.query.role : undefined;

  const where = {
    ...(role && { role }),
    // Match the search text against email, first name or last name.
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: PUBLIC_USER_FIELDS,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, page, pageSize: PAGE_SIZE, total });
});

// GET /internal/users/by-email?email=someone@example.com
// Used by auth-service at login to find the user Keycloak just verified.
router.get('/users/by-email', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'email query parameter is required' });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: PUBLIC_USER_FIELDS });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// GET /internal/users/:id
// Used by auth-service to load the current user (and their role) for a session.
router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: PUBLIC_USER_FIELDS });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// POST /internal/users   body: { email, firstName, lastName, role, company? }
// Creates the profile. auth-service has already validated the input and
// created the matching Keycloak account.
router.post('/users', async (req, res) => {
  const { email, firstName, lastName, role, company } = req.body || {};
  if (!email || !firstName || !lastName || !ROLES.includes(role)) {
    return res.status(400).json({ error: 'email, firstName, lastName and a valid role are required' });
  }

  try {
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), firstName, lastName, role, company: company || null },
      select: PUBLIC_USER_FIELDS,
    });
    res.status(201).json(user);
  } catch (err) {
    // P2002 = unique constraint failed, i.e. the email is already used.
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  }
});

// PATCH /internal/users/:id   body: { role?, isActive? }
// Changes a user's role and/or enables/disables them.
router.patch('/users/:id', async (req, res) => {
  const { role, isActive } = req.body || {};
  const data = {};
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    data.role = role;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
    data.isActive = isActive;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: PUBLIC_USER_FIELDS });
    res.json(user);
  } catch (err) {
    // P2025 = record to update not found.
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    throw err;
  }
});

module.exports = router;
