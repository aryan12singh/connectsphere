import { createEventsResponse } from '../utils/eventMocks'

/**
 * BFF mock for GET /api/events.
 * Returns deterministic mock data so the frontend can be built
 * against a stable contract before the real events service lands.
 */
export default defineEventHandler(() => createEventsResponse())
