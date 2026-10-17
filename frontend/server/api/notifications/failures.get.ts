import { kongBffFetch } from '../../utils/kongBff'

/** CS-50: deliveries that failed after 3 retries. notification-service requires audit.view. */
export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/notifications/failures')
})
