-- Attendance's local projection of Event Service's confirmed demo Event.
-- Event ID, dates, registration window, title and organiser match the
-- EventConfirmed outbox fixture in event-service's seed. The reviewed
-- Coordinator-set registration limit is seeded explicitly as 120, independent of planned attendance.
BEGIN;

-- Remove only records created by the retired, inconsistent Attendance seed.
DELETE FROM registrations WHERE id='r1000000-0000-4000-8000-000000000001';
DELETE FROM events WHERE "eventId" IN (
  'e1000000-0000-4000-8000-000000000008',
  'e1000000-0000-4000-8000-000000000009'
);

INSERT INTO events (
  id,"eventId",title,description,status,"eventVersion","startAt","endAt","timeZone",
  "primaryVenueId","primaryVenueName","registrationLimit","registrationEnabled",
  "registrationWindow","organiserId","createdAt","updatedAt"
) VALUES (
  'f1000000-0000-4000-8000-000000000016','f1000000-0000-4000-8000-000000000016',
  'ConnectSphere Spring Showcase','A confirmed attendee-facing event fixture.','CONFIRMED',5,
  '2027-04-16 01:00:00+00','2027-04-16 09:00:00+00','Asia/Singapore',
  'b3000000-0000-4000-8000-000000000001','Marina Convention Centre',120,true,
  '{"startAt":"2026-10-24T00:00:00.000Z","endAt":"2027-04-15T15:59:00.000Z"}'::jsonb,
  'a1000000-0000-4000-8000-000000000001','2026-10-20 04:00:00+00','2026-10-20 04:00:00+00'
)
ON CONFLICT ("eventId") DO UPDATE SET
  id=EXCLUDED.id,title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,
  "eventVersion"=EXCLUDED."eventVersion","startAt"=EXCLUDED."startAt","endAt"=EXCLUDED."endAt",
  "timeZone"=EXCLUDED."timeZone","primaryVenueId"=EXCLUDED."primaryVenueId",
  "primaryVenueName"=EXCLUDED."primaryVenueName","registrationLimit"=EXCLUDED."registrationLimit",
  "registrationEnabled"=EXCLUDED."registrationEnabled","registrationWindow"=EXCLUDED."registrationWindow",
  "organiserId"=EXCLUDED."organiserId","updatedAt"=EXCLUDED."updatedAt";

COMMIT;
