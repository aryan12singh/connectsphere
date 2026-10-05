import { kongBffFetch } from '../../utils/kongBff'

export default defineEventHandler(async (event) => {
  return await kongBffFetch(event, '/venues', { query: getQuery(event) })
})
