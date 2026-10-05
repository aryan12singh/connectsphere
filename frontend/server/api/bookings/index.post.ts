import { kongBffFetch, idempotencyHeaders } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/venue-bookings', {
    method: 'POST',
    body: await readBody(event),
    headers: idempotencyHeaders(event),
  })
})
