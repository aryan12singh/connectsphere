import { MOCK_USERS } from '../../utils/mockUserDb'

function toFrontendRole(backendRole: string): string {
  return backendRole === 'ADMIN' ? 'TECHNICAL_SUPPORT_STAFF' : backendRole
}

export default defineEventHandler((event) => {
  const raw = getCookie(event, 'connectsphere_session')
  if (!raw)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  try {
    const parsed = JSON.parse(raw) as { userId: string }
    const dbUser = MOCK_USERS.find(u => u.id === parsed.userId)
    if (!dbUser)
      throw new Error('no user')
    return { user: { id: dbUser.id, email: dbUser.email, name: `${dbUser.firstName} ${dbUser.lastName}`, role: toFrontendRole(dbUser.role) } }
  }
  catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
