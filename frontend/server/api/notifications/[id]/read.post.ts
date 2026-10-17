import { getRouterParam } from 'h3'
import { kongBffFetch } from '../../../utils/kongBff'

/** CS-50: mark one of the signed-in user's own notices as read. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await kongBffFetch(event, `/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} })
  setResponseStatus(event, 204)
  return null
})
