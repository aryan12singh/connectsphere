/**
 * BFF self sign-up — POST /api/auth/register.
 *
 * Creates an ATTENDEE account (decided 2026-10-01: sign-up is for attendees
 * only; staff accounts are created by tech support). The account works
 * immediately, but no session is created: the page sends the user to
 * /login?registered=1 to sign in.
 *
 * Only the expected fields are forwarded, so a role (or anything else) in the
 * request body never reaches the backend. auth-service fixes the role too.
 * Live mode only — there is no mock user store to add to.
 */
export default defineEventHandler(async (event) => {
  const { authMode } = useRuntimeConfig(event)
  if (authMode !== 'live')
    throw createError({ statusCode: 501, statusMessage: 'Sign-up needs NUXT_AUTH_MODE=live' })

  const body = await readBody<Record<string, unknown>>(event)
  const pick = (key: string) => (typeof body?.[key] === 'string' ? body[key] : undefined)

  const result = await backendFetch<{ user: { id: string, email: string, role: string } }>(event, '/auth/register', {
    method: 'POST',
    body: {
      email: pick('email'),
      firstName: pick('firstName'),
      lastName: pick('lastName'),
      company: pick('company'),
      password: pick('password'),
    },
  })

  setResponseStatus(event, 201)
  return { user: { email: result.user.email, role: result.user.role } }
})
