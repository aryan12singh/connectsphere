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
    'b4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000010',
    'b3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000005',
    'Autumn Product Summit', 'Coordinator submitted event requirements',
    '2026-11-20 01:00:00+00', '2026-11-20 09:00:00+00', 'Asia/Singapore',
    'TENTATIVELY_HELD', 'seed-booking-002',
    'a1000000-0000-4000-8000-000000000005', 'EVENT_COORDINATOR', '2026-09-25 04:05:00+00', 'Coordinator submitted event requirements',
    '2026-09-25 04:05:00+00', '2026-09-25 04:05:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000011',
    'b3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000009',
    'Leadership Workshop', 'Venue staff confirmed the requested room',
    '2026-10-21 02:00:00+00', '2026-10-21 06:00:00+00', 'Asia/Singapore',
    'CONFIRMED', 'seed-booking-003',
    'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', '2026-09-25 04:10:00+00', 'Venue staff confirmed the requested room',
    '2026-09-25 04:07:00+00', '2026-09-25 04:10:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000012',
    'b3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000006',
    'Innovation Demo Day', 'Venue staff placed a temporary hold',
    '2026-12-02 03:00:00+00', '2026-12-02 08:00:00+00', 'Asia/Singapore',
    'AVAILABLE', 'seed-booking-004',
    'a1000000-0000-4000-8000-000000000010', 'VENUE_STAFF', '2026-09-25 04:15:00+00', 'Venue returned the slot to availability',
    '2026-09-25 04:15:00+00', '2026-09-25 04:15:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000013',
    'b3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000005',
    'Partner Briefing', 'Venue capacity is unavailable for this request',
    '2026-10-28 01:00:00+00', '2026-10-28 05:00:00+00', 'Asia/Singapore',
    'UNAVAILABLE', 'seed-booking-005',
    'a1000000-0000-4000-8000-000000000008', 'VENUE_STAFF', '2026-09-25 04:20:00+00', 'Venue capacity is unavailable for this request',
    '2026-09-25 04:20:00+00', '2026-09-25 04:20:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000014',
    'b3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000006',
    'Training Session', 'Request rejected because the venue is reserved',
    '2026-11-04 02:00:00+00', '2026-11-04 04:00:00+00', 'Asia/Singapore',
    'REJECTED', 'seed-booking-006',
    'a1000000-0000-4000-8000-000000000009', 'VENUE_STAFF', '2026-09-25 04:25:00+00', 'Request rejected because the venue is reserved',
    '2026-09-25 04:25:00+00', '2026-09-25 04:25:00+00'
  ),
  (
    'b4000000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000015',
    'b3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000006',
    'Community Showcase', 'Coordinator cancelled the tentative booking',
    '2026-11-12 02:00:00+00', '2026-11-12 07:00:00+00', 'Asia/Singapore',
    'CANCELLED', 'seed-booking-007',
    'a1000000-0000-4000-8000-000000000006', 'EVENT_COORDINATOR', '2026-09-25 04:30:00+00', 'Coordinator cancelled the tentative booking',
    '2026-09-25 04:27:00+00', '2026-09-25 04:30:00+00'
  )
ON CONFLICT ("id") DO UPDATE SET "eventId"=EXCLUDED."eventId";

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

-- Confirmed venue bookings for the Technical Review demo Events. These exact
-- Event IDs and instants are also present in the event-service seed.
INSERT INTO "venue_booking_requests" (
  "id", "eventId", "venueId", "requestedById", "title", "reason",
  "requestedStart", "requestedEnd", "timeZone", "status", "idempotencyKey",
  "statusChangedById", "statusChangedRole", "statusChangedAt", "statusReason",
  "expectedAttendance", "layout", "createdAt", "updatedAt"
) VALUES
  ('b4000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000008',
   'b3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005',
   'Product Showcase','Confirmed venue booking for Technical Review demo.',
   '2027-03-16 09:00:00+08','2027-03-16 17:00:00+08','Asia/Singapore','CONFIRMED','seed-booking-008',
   'a1000000-0000-4000-8000-000000000008','VENUE_STAFF','2026-10-06 03:10:00+00','Venue staff confirmed the event booking.',
   180,'THEATRE','2026-10-06 03:00:00+00','2026-10-06 03:10:00+00'),
  ('b4000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000009',
   'b3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000006',
   'Community Film Night','Confirmed venue booking for Technical Review demo.',
   '2027-03-18 17:00:00+08','2027-03-18 19:30:00+08','Asia/Singapore','CONFIRMED','seed-booking-009',
   'a1000000-0000-4000-8000-000000000009','VENUE_STAFF','2026-10-06 04:10:00+00','Venue staff confirmed the event booking.',
   240,'THEATRE','2026-10-06 04:00:00+00','2026-10-06 04:10:00+00'),
  ('b4000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000016',
   'b3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005',
   'ConnectSphere Spring Showcase','Confirmed venue booking for the attendee-facing seed Event.',
   '2027-04-16 01:00:00','2027-04-16 09:00:00','Asia/Singapore','CONFIRMED','seed-booking-010',
   'a1000000-0000-4000-8000-000000000008','VENUE_STAFF','2026-10-20 03:15:00+00','Venue staff approved the reviewed room arrangement.',
   120,'THEATRE','2026-10-20 03:00:00+00','2026-10-20 03:15:00+00')
ON CONFLICT ("id") DO NOTHING;

-- Align the approved room, primary venue and request fingerprint with the
-- Confirmed Event fixture. The DB columns use timestamps without time zone.
UPDATE "venue_booking_requests"
SET "requestedStart"='2027-04-16 01:00:00',
    "requestedEnd"='2027-04-16 09:00:00',
    "version"=2,
    "expectedAttendance"=120,
    "layout"='THEATRE',
    "accessibilityNeeds"=ARRAY['WHEELCHAIR_ACCESS']::text[],
    "required"=true,
    "setupMinutes"=0,
    "turnaroundMinutes"=0,
    "occupiedStart"='2027-04-16 01:00:00',
    "occupiedEnd"='2027-04-16 09:00:00',
    "venueVersion"=1,
    "requirements"='{"startAt":"2027-04-16T01:00:00.000Z","endAt":"2027-04-16T09:00:00.000Z","timeZone":"Asia/Singapore","expectedAttendance":120,"minimumCapacity":120,"preferredLayout":"THEATRE","venueType":"PHYSICAL","venueRequirements":"One accessible theatre room for 120 attendees.","accessibilityNeeds":["WHEELCHAIR_ACCESS"],"accessibilityDetails":"Step-free access and wheelchair seating."}'::jsonb,
    "requirementsFingerprint"='2d9b6f05078243437d3e3dcf8738cc25cb8ab222745e0eb2bcdfa5a6348a08cc',
    "flags"=ARRAY[]::text[]
WHERE "id"='b4000000-0000-4000-8000-000000000010';

INSERT INTO "event_primary_venues" ("eventId","bookingId","version","actorId","updatedAt")
VALUES ('f1000000-0000-4000-8000-000000000016','b4000000-0000-4000-8000-000000000010',1,'a1000000-0000-4000-8000-000000000005','2026-10-20 03:15:00')
ON CONFLICT ("eventId") DO UPDATE SET "bookingId"=EXCLUDED."bookingId","actorId"=EXCLUDED."actorId","updatedAt"=EXCLUDED."updatedAt";

INSERT INTO "venue_booking_activity" (
  "id", "bookingId", "actorId", "actorRole", "action", "fromStatus", "toStatus",
  "reason", "changes", "occurredAt"
) VALUES
  ('b4100000-0000-4000-8000-000000000010','b4000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000005','EVENT_COORDINATOR','BOOKING_CREATED',NULL,'TENTATIVELY_HELD','Coordinator requested the venue for Product Showcase.','{"source":"technical-review-demo"}'::jsonb,'2026-10-06 03:00:00+00'),
  ('b4100000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000008','VENUE_STAFF','STATUS_CHANGED','TENTATIVELY_HELD','CONFIRMED','Venue staff confirmed the event booking.','{"source":"technical-review-demo"}'::jsonb,'2026-10-06 03:10:00+00'),
  ('b4100000-0000-4000-8000-000000000012','b4000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000006','EVENT_COORDINATOR','BOOKING_CREATED',NULL,'TENTATIVELY_HELD','Coordinator requested the venue for Community Film Night.','{"source":"technical-review-demo"}'::jsonb,'2026-10-06 04:00:00+00'),
  ('b4100000-0000-4000-8000-000000000013','b4000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000009','VENUE_STAFF','STATUS_CHANGED','TENTATIVELY_HELD','CONFIRMED','Venue staff confirmed the event booking.','{"source":"technical-review-demo"}'::jsonb,'2026-10-06 04:10:00+00'),
  ('b4100000-0000-4000-8000-000000000014','b4000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000005','EVENT_COORDINATOR','BOOKING_CREATED',NULL,'TENTATIVELY_HELD','Coordinator requested the reviewed event venue.','{"source":"confirmed-attendance-seed"}'::jsonb,'2026-10-20 03:00:00+00'),
  ('b4100000-0000-4000-8000-000000000015','b4000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000008','VENUE_STAFF','STATUS_CHANGED','TENTATIVELY_HELD','CONFIRMED','Venue Staff approved the reviewed room arrangement.','{"source":"confirmed-attendance-seed"}'::jsonb,'2026-10-20 03:15:00+00'),
  ('b4100000-0000-4000-8000-000000000016','b4000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000005','EVENT_COORDINATOR','PRIMARY_VENUE_SELECTED','CONFIRMED','CONFIRMED','Coordinator designated the confirmed attendee location.','{"source":"confirmed-attendance-seed"}'::jsonb,'2026-10-20 03:15:00+00')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
