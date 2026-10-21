import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Event ID is required.' })
  return await kongBffFetch(event, `/attendances/registrations/${encodeURIComponent(eventId)}`)
})
