/**
 * BFF mock for POST /api/auth/login.
 * Returns deterministic mock data so the frontend can be built
 * against a stable contract before the real auth service lands.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string, rememberMe?: boolean }>(event)

  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  return {
    user: {
      id: 'mock-user-1',
      email: body.email,
      name: 'Event Organiser',
      role: 'organiser',
    },
    token: 'mock-token-123',
  }
})
