/** Public Organiser/Attendee signup. Only whitelisted input reaches auth-service. */
import { setResponseStatus } from 'h3'
export default defineEventHandler(async (event) => {
  const { authMode } = useRuntimeConfig(event)
  if (authMode !== 'live')
    throw createError({ statusCode: 501, statusMessage: 'Sign-up needs NUXT_AUTH_MODE=live' })

  const body = await readBody<Record<string, unknown>>(event)
  const pick = (key: string) => (typeof body?.[key] === 'string' ? body[key] : undefined)

  const result = await backendFetch<{ user: { id: string, email: string, role: string } }>(event, '/auth/register', {
    method: 'POST',
    body: {
      role: body?.role === undefined ? 'ATTENDEE' : body.role,
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
