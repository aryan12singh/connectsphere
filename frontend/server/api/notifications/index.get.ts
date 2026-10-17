import { kongBffFetch } from '../../utils/kongBff'

/** CS-50: the signed-in user's own notices (filtered by notification-service). */
export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/notifications')
})
