import { kongBffFetch } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return await kongBffFetch(event, '/attendances/events')
})
