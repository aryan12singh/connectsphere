import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (session.user.role !== 'EVENT_ORGANISER')
    throw createError({ statusCode: 403, statusMessage: 'Only organisers can view all venues.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event ID is required.' })
  return await kongBffFetch(event, `/attendances/events/${encodeURIComponent(id)}/organiser`)
})
