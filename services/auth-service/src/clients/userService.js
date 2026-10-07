// Calls user-service's internal API. auth-service never touches user_db
// directly — each service only talks to its own database.
const config = require('../config');

// Sends a request to user-service with the internal API key.
function callUserService(path, options = {}) {
  return fetch(`${config.userServiceUrl}${path}`, {
    ...options,
    headers: {
      'x-internal-api-key': config.internalApiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(5000),
  });
}

// Thrown when user-service rejects the input (400/404/409). Routes pass the
// status and message straight on to the caller.
class UserServiceError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Reads the JSON body, or throws: UserServiceError for 4xx, plain Error for 5xx.
async function readBody(response, what) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  if (response.status >= 400 && response.status < 500) {
    const error = body.error;
    throw new UserServiceError(response.status, typeof error === 'string' ? error : error?.message || 'Request rejected', error?.fields);
  }
  throw new Error(`user-service ${what} failed with ${response.status}`);
}

// Returns { id, email, firstName, lastName, role, company, isActive } or null.
async function findUserByEmail(email) {
  const response = await callUserService(`/internal/users/by-email?email=${encodeURIComponent(email)}`);
  if (response.status === 404) return null;
  return readBody(response, 'find by email');
}

// Returns the user or null.
async function findUserById(id) {
  const response = await callUserService(`/internal/users/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  return readBody(response, 'find by id');
}

// Returns { users, page, pageSize, total }.
async function listUsers({ search, role, page }) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (role) params.set('role', role);
  if (page) params.set('page', String(page));
  return readBody(await callUserService(`/internal/users?${params}`), 'list');
}

async function createUser(data) {
  return readBody(await callUserService('/internal/users', { method: 'POST', body: JSON.stringify(data) }), 'create');
}

// changes: { role?, isActive? }
async function updateUser(id, changes) {
  return readBody(
    await callUserService(`/internal/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }),
    'update',
  );
}

module.exports = { findUserByEmail, findUserById, listUsers, createUser, updateUser, UserServiceError };
