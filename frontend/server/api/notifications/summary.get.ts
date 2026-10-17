import { kongBffFetch } from '../../utils/kongBff'

/** CS-50: unread count and badge text for the bell. */
export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/notifications/summary')
})
