import { kongBffFetch } from '../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user?.role !== 'TECHNICAL_SUPPORT_STAFF')
    throw createError({ statusCode: 403, statusMessage: 'Only Technical Support may view the technical review queue.' })
  return await kongBffFetch(event, '/technical-requests')
})
