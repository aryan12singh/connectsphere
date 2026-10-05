import { kongBffFetch, idempotencyHeaders } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/venues', {
    method: 'POST',
    body: await readBody(event),
    headers: idempotencyHeaders(event),
  })
})
