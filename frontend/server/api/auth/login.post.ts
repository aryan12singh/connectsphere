import { findUserByEmail, verifyPassword } from '../../utils/mockUserDb'

// BFF validation — utils stays pure mock DB (ADMIN). BFF translates ADMIN→TECHNICAL_SUPPORT_STAFF.
function toFrontendRole(backendRole: string): string {
  return backendRole === 'ADMIN' ? 'TECHNICAL_SUPPORT_STAFF' : backendRole
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown, password?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password)
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })

  const user = findUserByEmail(email)
  if (!user || !verifyPassword(user, password))
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })

  // Never assign privileged default — if role is missing/unknown, deny
  if (!user.role)
    throw createError({ statusCode: 403, statusMessage: 'Account not authorised' })

  // Session via httpOnly cookie (mock). In prod: sign JWT via user-service.
  setCookie(event, 'connectsphere_session', JSON.stringify({ userId: user.id }), { httpOnly: true, path: '/', maxAge: 60 * 60 * 8, sameSite: 'lax' })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: toFrontendRole(user.role),
    },
    token: 'mock-token-123',
  }
})
