-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — venue-service (venue_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- managedById -> user_db.users.id (role VENUE_STAFF)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- venues
INSERT INTO "venues" ("id", "name", "address", "capacity", "amenities", "isActive", "managedById", "createdAt", "updatedAt") VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Marina Convention Centre - Hall A', '18 Bayfront Link, #01-01, Singapore 018977', 500, ARRAY['Projector', 'PA system', 'Stage', 'Wi-Fi', 'Wheelchair access', 'Livestream booth']::text[], TRUE, 'a1000000-0000-4000-8000-000000000008', '2026-05-03 02:00:00.000', '2026-05-03 02:00:00.000'),  -- V01 managed by Ravi Kumar
  ('b1000000-0000-4000-8000-000000000002', 'Marina Convention Centre - Seminar Room 3', '18 Bayfront Link, #03-12, Singapore 018977', 80, ARRAY['Projector', 'Whiteboard', 'Wi-Fi', 'Wheelchair access']::text[], TRUE, 'a1000000-0000-4000-8000-000000000008', '2026-05-03 02:00:00.000', '2026-05-03 02:00:00.000'),  -- V02 managed by Ravi Kumar
  ('b1000000-0000-4000-8000-000000000003', 'Harbourfront Hall - Grand Ballroom', '5 Keppel Waterfront Road, Singapore 098634', 300, ARRAY['PA system', 'Stage', 'Catering kitchen', 'Wi-Fi', 'Wheelchair access']::text[], TRUE, 'a1000000-0000-4000-8000-000000000009', '2026-05-03 03:00:00.000', '2026-05-03 03:00:00.000'),  -- V03 managed by Grace Teo
  ('b1000000-0000-4000-8000-000000000004', 'Harbourfront Hall - Riverside Terrace', '5 Keppel Waterfront Road, Level 2, Singapore 098634', 120, ARRAY['PA system', 'Wi-Fi', 'Outdoor area']::text[], TRUE, 'a1000000-0000-4000-8000-000000000009', '2026-05-03 03:10:00.000', '2026-05-03 03:10:00.000'),  -- V04 managed by Grace Teo
  ('b1000000-0000-4000-8000-000000000005', 'one-north Innovation Hub - Auditorium', '21 Fusionopolis Walk, Singapore 138628', 200, ARRAY['Projector', 'PA system', 'Stage', 'Wi-Fi', 'Wheelchair access', 'Hearing loop']::text[], TRUE, 'a1000000-0000-4000-8000-000000000010', '2026-05-04 01:00:00.000', '2026-05-04 01:00:00.000'),  -- V05 managed by Jonathan Yeo
  ('b1000000-0000-4000-8000-000000000006', 'one-north Innovation Hub - Workshop Studio', '21 Fusionopolis Walk, #04-08, Singapore 138628', 40, ARRAY['Whiteboard', 'Wi-Fi', 'Breakout tables']::text[], FALSE, 'a1000000-0000-4000-8000-000000000010', '2026-05-04 01:10:00.000', '2026-09-01 02:00:00.000')  -- V06 managed by Jonathan Yeo | INACTIVE
ON CONFLICT ("id") DO NOTHING;
COMMIT;
