import { kongBffFetch } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/venue-bookings/availability', { query: getQuery(event) })
})
