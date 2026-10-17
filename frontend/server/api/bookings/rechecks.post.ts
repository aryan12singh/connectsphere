import { kongBffFetch } from '../../utils/kongBff'

export default defineEventHandler(async event => {
  return kongBffFetch(event, '/venue-bookings/rechecks', {
    method: 'POST',
    body: await readBody(event),
  })
})
