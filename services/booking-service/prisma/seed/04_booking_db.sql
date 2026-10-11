-- ConnectSphere seed data — booking-service (booking_db)
-- Load after 01_user_db.sql and 03_venue_db.sql.
-- eventId values are logical cross-service references to event-service.
-- This seed deliberately includes every persisted BookingStatus value.

BEGIN;

INSERT INTO "venue_booking_requests" (
  "id", "eventId", "venueId", "requestedById", "title", "reason",
  "requestedStart", "requestedEnd", "timeZone", "status", "idempotencyKey",
  "statusChangedById", "statusChangedRole", "statusChangedAt", "statusReason",
  "createdAt", "updatedAt"
) VALUES
  (
    'b4000000-0000-4000-8000-000000000001', NULL,
    'b3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000008',
    'Venue maintenance block', 'Planned annual maintenance',
    '2026-10-10 01:00:00+00', '2026-10-10 09:00:00+00', 'Asia/Singapore',
    'BLOCKED', 'seed-booking-001',
    'a1000000-0000-4000-8000-000000000008', 'VENUE_STAFF', '2026-09-25 04:00:00+00', 'Planned annual maintenance',
    '2026-09-25 04:00:00+00', '2026-09-25 04:00:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000005',
    'Autumn Product Summit', 'Coordinator submitted event requirements',
    '2026-11-20 01:00:00+00', '2026-11-20 09:00:00+00', 'Asia/Singapore',
    'TENTATIVELY_HELD', 'seed-booking-002',
    'a1000000-0000-4000-8000-000000000005', 'EVENT_COORDINATOR', '2026-09-25 04:05:00+00', 'Coordinator submitted event requirements',
    '2026-09-25 04:05:00+00', '2026-09-25 04:05:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000009',
    'Leadership Workshop', 'Venue staff confirmed the requested room',
    '2026-10-21 02:00:00+00', '2026-10-21 06:00:00+00', 'Asia/Singapore',
    'CONFIRMED', 'seed-booking-003',
    'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', '2026-09-25 04:10:00+00', 'Venue staff confirmed the requested room',
    '2026-09-25 04:07:00+00', '2026-09-25 04:10:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000004', 'e5000000-0000-4000-8000-000000000003',
    'b3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000006',
    'Innovation Demo Day', 'Venue staff placed a temporary hold',
    '2026-12-02 03:00:00+00', '2026-12-02 08:00:00+00', 'Asia/Singapore',
    'AVAILABLE', 'seed-booking-004',
    'a1000000-0000-4000-8000-000000000010', 'VENUE_STAFF', '2026-09-25 04:15:00+00', 'Venue returned the slot to availability',
    '2026-09-25 04:15:00+00', '2026-09-25 04:15:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000004',
    'b3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000005',
    'Partner Briefing', 'Venue capacity is unavailable for this request',
    '2026-10-28 01:00:00+00', '2026-10-28 05:00:00+00', 'Asia/Singapore',
    'UNAVAILABLE', 'seed-booking-005',
    'a1000000-0000-4000-8000-000000000008', 'VENUE_STAFF', '2026-09-25 04:20:00+00', 'Venue capacity is unavailable for this request',
    '2026-09-25 04:20:00+00', '2026-09-25 04:20:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000005',
    'b3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000006',
    'Training Session', 'Request rejected because the venue is reserved',
    '2026-11-04 02:00:00+00', '2026-11-04 04:00:00+00', 'Asia/Singapore',
    'REJECTED', 'seed-booking-006',
    'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', '2026-09-25 04:25:00+00', 'Request rejected because the venue is reserved',
    '2026-09-25 04:25:00+00', '2026-09-25 04:25:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000007', 'e5000000-0000-4000-8000-000000000006',
    'b3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000006',
    'Community Showcase', 'Coordinator cancelled the tentative booking',
    '2026-11-12 02:00:00+00', '2026-11-12 07:00:00+00', 'Asia/Singapore',
    'CANCELLED', 'seed-booking-007',
    'a1000000-0000-4000-8000-000000000006', 'EVENT_COORDINATOR', '2026-09-25 04:30:00+00', 'Coordinator cancelled the tentative booking',
    '2026-09-25 04:27:00+00', '2026-09-25 04:30:00+00'
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "venue_booking_activity" (
  "id", "bookingId", "actorId", "actorRole", "action", "fromStatus", "toStatus",
  "reason", "changes", "occurredAt"
) VALUES
  ('b4100000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000008', 'VENUE_STAFF', 'BOOKING_CREATED', NULL, 'BLOCKED', 'Planned annual maintenance', '{"source":"seed"}'::jsonb, '2026-09-25 04:00:00+00'),
  ('b4100000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005', 'EVENT_COORDINATOR', 'BOOKING_CREATED', NULL, 'TENTATIVELY_HELD', 'Coordinator submitted event requirements', '{"source":"seed"}'::jsonb, '2026-09-25 04:05:00+00'),
  ('b4100000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', 'BOOKING_CREATED', NULL, 'TENTATIVELY_HELD', 'Booking submitted for venue review', '{"source":"seed"}'::jsonb, '2026-09-25 04:07:00+00'),
  ('b4100000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', 'STATUS_CHANGED', 'TENTATIVELY_HELD', 'CONFIRMED', 'Venue staff confirmed the requested room', '{"source":"seed"}'::jsonb, '2026-09-25 04:10:00+00'),
  ('b4100000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000010', 'VENUE_STAFF', 'BOOKING_CREATED', NULL, 'AVAILABLE', 'Venue returned the slot to availability', '{"source":"seed"}'::jsonb, '2026-09-25 04:15:00+00'),
  ('b4100000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000008', 'VENUE_STAFF', 'BOOKING_CREATED', NULL, 'UNAVAILABLE', 'Venue capacity is unavailable for this request', '{"source":"seed"}'::jsonb, '2026-09-25 04:20:00+00'),
  ('b4100000-0000-4000-8000-000000000007', 'b4000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', 'BOOKING_CREATED', NULL, 'REJECTED', 'Request rejected because the venue is reserved', '{"source":"seed"}'::jsonb, '2026-09-25 04:25:00+00'),
  ('b4100000-0000-4000-8000-000000000008', 'b4000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000006', 'EVENT_COORDINATOR', 'BOOKING_CREATED', NULL, 'TENTATIVELY_HELD', 'Coordinator submitted the booking', '{"source":"seed"}'::jsonb, '2026-09-25 04:27:00+00'),
  ('b4100000-0000-4000-8000-000000000009', 'b4000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000006', 'EVENT_COORDINATOR', 'STATUS_CHANGED', 'TENTATIVELY_HELD', 'CANCELLED', 'Coordinator cancelled the tentative booking', '{"source":"seed"}'::jsonb, '2026-09-25 04:30:00+00')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
