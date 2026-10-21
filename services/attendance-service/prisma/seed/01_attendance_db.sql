-- Initial confirmed events for attendee preview (CS-47).
-- Reruns preserve existing event edits; these rows only add demo events.
INSERT INTO events (
  id, "eventId", title, description, status, "startAt", "endAt", "timeZone",
  "primaryVenueId", "primaryVenueName", "registrationLimit", "registrationWindow",
  "organiserId", "createdAt", "updatedAt"
) VALUES
  ('e1000000-0000-4000-8000-000000000008', 'e1000000-0000-4000-8000-000000000008',
   'Spring Gala 2026', 'Annual spring gala dinner and awards ceremony',
   'CONFIRMED', '2026-11-15 10:00:00+00', '2026-11-15 14:00:00+00', 'Asia/Singapore',
   'venue-main', 'Main Ballroom', 150,
   '{"startAt":"2026-10-01T00:00:00Z","endAt":"2026-11-10T00:00:00Z"}'::jsonb,
   'a1000000-0000-4000-8000-000000000005', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('e1000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-000000000009',
   'Tech Connect 2026', 'Technology conference and networking event',
   'CONFIRMED', '2026-12-03 09:00:00+00', '2026-12-03 17:00:00+00', 'Asia/Singapore',
   'venue-hall-a', 'Conference Hall A', 200,
   '{"startAt":"2026-10-15T00:00:00Z","endAt":"2026-11-30T00:00:00Z"}'::jsonb,
   'a1000000-0000-4000-8000-000000000006', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("eventId") DO NOTHING;

-- Sample registration for the first event
INSERT INTO registrations (id, "eventId", "userId", status, "registeredAt", "createdAt") VALUES
  ('r1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000008', 'attendee-1', 'CONFIRMED',
   '2026-10-15 00:00:00+00', CURRENT_TIMESTAMP)
ON CONFLICT ("eventId", "userId") DO NOTHING;
