import { MOCK_USERS } from '../../utils/mockUserDb'

/**
 * BFF mock for GET /api/users/:id — BFF profile view of the user-service
 * `User` record (`id, email, name, role`; `passwordHash` never leaves).
 * Any authenticated caller (organiser reads their coordinator, CS-30).
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = getRouterParam(event, 'id')
  const dbUser = id ? MOCK_USERS.find(user => user.id === id) : undefined
  if (!dbUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: `${dbUser.firstName} ${dbUser.lastName}`,
    role: dbUser.role,
  }
})
