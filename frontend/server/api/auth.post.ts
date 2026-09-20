import { findUserByEmail, verifyPassword } from '../utils/mockUserDb'

/**
 * BFF login — POST /api/auth.
 *
 * Pattern 2 (user-service/auth-service split): credentials are verified
 * against the user-service record and the opaque token comes from the
 * auth-service, which returns `{token}` only. Until the services land, both
 * are in-file mock stubs with hardcoded data; the sealed-session binding
 * below (`setUserSession`) is the production shape and stays.
 */

// Mock stub standing in for: user-service POST /internal/users/verify
// {email,password} → {id}|401. passwordHash never leaves user-service.
function verifyAgainstUserService(email: string, password: string) {
  const user = findUserByEmail(email)
  if (!user || !verifyPassword(user, password))
    return null
  return user
}

// The five AC roles (backend UserRole). Anything else — ghost strings,
// nulls, future values — is denied, never defaulted to a privileged role.
const ALLOWED_ROLES: readonly string[] = [
  'EVENT_ORGANISER',
  'EVENT_COORDINATOR',
  'VENUE_STAFF',
  'ATTENDEE',
  'TECHNICAL_SUPPORT_STAFF',
]

// Mock stub standing in for: auth-service login → {token} only.
function fetchTokenFromAuthService() {
  return 'mock-token-123'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown, password?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password)
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })

  const user = verifyAgainstUserService(email, password)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })

  // Never assign privileged default — if role is missing/unknown, deny
  if (!user.role || !ALLOWED_ROLES.includes(user.role))
    throw createError({ statusCode: 403, statusMessage: 'Account not authorised' })

  const token = fetchTokenFromAuthService()

  // Sealed server-side session (nuxt-auth-utils). Token never in the body.
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
    },
    token,
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
    },
  }
})
