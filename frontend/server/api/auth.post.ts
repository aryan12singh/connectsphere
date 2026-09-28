import { findUserByEmail, verifyPassword } from '../utils/mockUserDb'
import { MOCK_ROLE_PERMISSIONS } from '../utils/mockPermissions'
import type { BackendUser } from '../utils/backend'

/**
 * BFF login — POST /api/auth.
 *
 * Two modes (runtimeConfig.authMode / NUXT_AUTH_MODE):
 *   live — auth-service checks the password (via Keycloak) and returns
 *          { token, user, permissions }.
 *   mock — the in-file mock users (server/utils/mockUserDb.ts). Default, so
 *          the event mocks and existing tests keep working without a backend.
 *
 * Either way the result is sealed into the session cookie (nuxt-auth-utils).
 * The token goes in `secure`, which never leaves the server; the browser
 * only ever sees `user`.
 */

// The five AC roles (backend UserRole). Anything else — ghost strings,
// nulls, future values — is denied, never defaulted to a privileged role.
const ALLOWED_ROLES: readonly string[] = [
  'EVENT_ORGANISER',
  'EVENT_COORDINATOR',
  'VENUE_STAFF',
  'ATTENDEE',
  'TECHNICAL_SUPPORT_STAFF',
]

interface LoginResult {
  token: string
  user: { id: string, email: string, name: string, role: string, permissions: string[] }
}

// Real login through Kong → auth-service. Wrong password, unknown email and
// locked account all come back as 401 from the backend.
async function loginWithAuthService(event: Parameters<typeof backendFetch>[0], email: string, password: string): Promise<LoginResult> {
  const result = await backendFetch<{ token: string, user: BackendUser, permissions: string[] }>(event, '/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  return { token: result.token, user: toSessionUser(result.user, result.permissions) }
}

// Mock login against mockUserDb.
function loginWithMock(email: string, password: string): LoginResult {
  const user = findUserByEmail(email)
  if (!user || !verifyPassword(user, password))
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  return {
    token: 'mock-token-123',
    user: {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      permissions: MOCK_ROLE_PERMISSIONS[user.role] ?? [],
    },
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown, password?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password)
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })

  const { authMode } = useRuntimeConfig(event)
  const { token, user } = authMode === 'live'
    ? await loginWithAuthService(event, email, password)
    : loginWithMock(email, password)

  // Never assign privileged default — if role is missing/unknown, deny
  if (!user.role || !ALLOWED_ROLES.includes(user.role))
    throw createError({ statusCode: 403, statusMessage: 'Account not authorised' })

  // Sealed server-side session (nuxt-auth-utils). `secure` stays on the server.
  await setUserSession(event, {
    user,
    secure: { token },
  })

  return { user }
})
