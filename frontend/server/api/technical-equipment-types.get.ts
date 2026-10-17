import { kongBffFetch } from '../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!['EVENT_COORDINATOR', 'TECHNICAL_SUPPORT_STAFF'].includes(String(session.user?.role)))
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view equipment types.' })
  return await kongBffFetch(event, '/equipment-types')
})
