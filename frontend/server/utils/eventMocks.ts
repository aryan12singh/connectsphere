import type { EventsResponse, OrganiserEvent } from '~/lib/events'

/** Mock rows for GET /api/events. Replace with the real data source; keep the contract. */
export const MOCK_EVENTS: OrganiserEvent[] = [
  {
    id: 'e1',
    category: 'CORPORATE EVENT',
    title: 'Product Summit Launch',
    meta: 'Date TBC · Capacity 300 · Draft — not yet submitted',
    status: 'draft',
  },
  {
    id: 'e2',
    category: 'CORPORATE EVENT',
    title: 'Autumn Product Summit',
    meta: 'Oct 14, 9:00 AM · Riverside Hall · 220 capacity',
    status: 'under-review',
  },
  {
    id: 'e3',
    category: 'GALA DINNER',
    title: 'Riverside Hall Gala',
    meta: 'Nov 2, 6:00 PM · Riverside Hall · 180 capacity',
    status: 'confirmed',
  },
  {
    id: 'e4',
    category: 'TRADE SHOW',
    title: 'Vendor Expo 2026',
    meta: 'Dec 5, 10:00 AM · Oakview Pavilion · 400 capacity',
    status: 'planning',
  },
  {
    id: 'e5',
    category: 'INTERNAL MEETING',
    title: 'Q3 Townhall',
    meta: 'Sep 20, 2:00 PM · The Grainhouse · 120 capacity',
    status: 'completed',
  },
  {
    id: 'e6',
    category: 'CHARITY EVENT',
    title: 'Winter Charity Ball',
    meta: 'Requested Dec 18 · Venue unavailable',
    status: 'rejected',
  },
]

export function createEventsResponse(): EventsResponse {
  return { events: MOCK_EVENTS }
}
