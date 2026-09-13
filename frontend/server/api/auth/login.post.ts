import { createLoginResponse, validateLoginBody } from '../../utils/authMocks'

/**
 * BFF mock for POST /api/auth/login.
 * Returns deterministic mock data so the frontend can be built
 * against a stable contract before the real auth service lands.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const problem = validateLoginBody(body)

  if (problem)
    throw createError({ statusCode: 400, statusMessage: problem })

  return createLoginResponse((body as { email: string }).email)
})
