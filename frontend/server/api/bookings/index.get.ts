import { kongBffFetch } from '../../utils/kongBff'

/** Preferred frontend name; Kong continues to expose /venue-bookings. */
export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/venue-bookings', { query: getQuery(event) })
})
