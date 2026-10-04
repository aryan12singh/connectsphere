import { kongBffFetch } from '../../../../utils/kongBff'

/**
 * Combined-history service for the Venue Booking version-history UI.
 * Each upstream service remains the source of its own history records.
 */
async function venueHistoryFromKong(event: Parameters<typeof kongBffFetch>[0], venueId: string) {
  const [venueHistory, bookingHistory] = await Promise.all([
    kongBffFetch<{ items?: unknown[] }>(event, `/venues/${encodeURIComponent(venueId)}/history`),
    kongBffFetch<{ items?: unknown[] }>(event, '/venue-bookings/history', { query: { venueId } }),
  ])
  const items = [...(venueHistory.items ?? []), ...(bookingHistory.items ?? [])]
    .sort((left, right) => {
      const leftTime = typeof left === 'object' && left && 'occurredAt' in left ? String(left.occurredAt) : ''
      const rightTime = typeof right === 'object' && right && 'occurredAt' in right ? String(right.occurredAt) : ''
      return rightTime.localeCompare(leftTime)
    })
  return { venueId, items }
}

/**
 * BFF route for the combined-history service.
 */
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'venueId')
  if (!venueId)
    throw createError({ statusCode: 400, statusMessage: 'Venue id is required' })
  return await venueHistoryFromKong(event, venueId)
})
