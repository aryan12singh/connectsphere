import { getRouterParam, readBody, setResponseStatus } from 'h3'
import { kongBffFetch } from '../../../../utils/kongBff'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Event ID is required.' })
  const result = await kongBffFetch(event, `/attendances/events/${encodeURIComponent(id)}/registrations`, {
    method: 'POST', body: await readBody(event),
  })
  setResponseStatus(event, 201)
  return result
})
