// Internal routes: called by other services (auth-service for now), never by
// the browser. Every route here is protected by internalOnly.
//
// These routes don't check permissions themselves — auth-service checks
// that the caller is allowed (e.g. has "users.manage") before calling them.
const express = require('express');
const prisma = require('../db');
const internalOnly = require('../middleware/internalOnly');
const { ROLES, PUBLIC_ROLES } = require('../../../utils/role-policy');

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
  roles: true,
  organisationId: true,
  company: true,
  isActive: true,
  createdAt: true,
};



// Narrow trusted directory for the merged assignment selector; no profile dump.
router.get('/coordinators', async (req, res) => {
  const coordinators = await prisma.user.findMany({where:{isActive:true,roles:{has:'EVENT_COORDINATOR'}},select:{id:true,createdAt:true},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  res.json({coordinators});
});

// GET /internal/users?search=tan&role=ATTENDEE&page=1
// Paged list for the tech support "Users" screen. 25 users per page.
router.get('/users', async (req, res) => {
  const PAGE_SIZE = 25;
  const page = Math.max(1, Number(req.query.page) || 1);
  const search = String(req.query.search || '').trim();
  const role = ROLES.includes(req.query.role) ? req.query.role : undefined;

  const where = {
    ...(role && { roles: { has: role } }),
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
  const fields = {};
  const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!validText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fields.email = ['A valid email is required'];
  if (!validText(firstName, 100)) fields.firstName = ['First name is required (max 100 characters)'];
  if (!validText(lastName, 100)) fields.lastName = ['Last name is required (max 100 characters)'];
  if (!PUBLIC_ROLES.includes(role)) fields.role = ['Only Organiser and Attendee may be provisioned; staff roles are seed-only'];
  if (role === 'EVENT_ORGANISER' && !validText(company, 200)) fields.company = ['Organisation is required (max 200 characters)'];
  else if (company !== undefined && company !== null && company !== '' && !validText(company, 200)) fields.company = ['Organisation must be text (max 200 characters)'];
  if (Object.keys(fields).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile contains invalid fields', fields } });

  try {
    const user = await prisma.$transaction(async tx => {
      const organisation = role === 'EVENT_ORGANISER'
        ? await tx.organisation.upsert({ where: { name: company.trim() }, create: { name: company.trim() }, update: { name: company.trim() } })
        : null;
      return tx.user.create({
        data: { email: email.trim().toLowerCase(), firstName: firstName.trim(), lastName: lastName.trim(), role, roles: [role], company: company?.trim() || null, organisationId: organisation?.id ?? null },
        select: PUBLIC_USER_FIELDS,
      });
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'VALIDATION_ERROR', message: 'A user with this email already exists', fields: { email: ['A user with this email already exists'] } } });
    throw err;
  }
});

// PATCH /internal/users/:id   body: { role?, isActive? }
// Changes a user's role and/or enables/disables them.
router.patch('/users/:id', async (req, res) => {
  const { role, isActive } = req.body || {};
  const data = {};
  if (role !== undefined) {
    if (!PUBLIC_ROLES.includes(role)) return res.status(400).json({ error: 'Staff roles are seed-only; only public roles may be changed' });
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, select: PUBLIC_USER_FIELDS });
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if ((existing.roles ?? [existing.role]).some(value => !PUBLIC_ROLES.includes(value))) return res.status(400).json({ error: 'Seeded staff roles cannot be changed through this endpoint' });
    if (role === 'EVENT_ORGANISER' && !existing.organisationId) return res.status(400).json({ error: 'An organisation is required before changing to Organiser' });
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
