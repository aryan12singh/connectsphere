-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — auth-service (auth_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- tokenHash = sha256 (lowercase hex) of the plaintext dev token shown in each row comment,
--             computed at load time with PostgreSQL's built-in sha256() (PG 11+).
-- userId -> user_db.users.id
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- sessions
INSERT INTO "sessions" ("id", "tokenHash", "userId", "expiresAt", "revokedAt", "createdAt") VALUES
  ('a2000000-0000-4000-8000-000000000001', encode(sha256(convert_to('seed-dev-token-01-sarah-tan',     'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000001', '2026-10-02 01:00:00.000', NULL,                      '2026-09-25 01:00:00.000'),  -- active - organiser Sarah Tan | token: seed-dev-token-01-sarah-tan
  ('a2000000-0000-4000-8000-000000000002', encode(sha256(convert_to('seed-dev-token-02-aisha-rahman',  'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000005', '2026-10-02 00:30:00.000', NULL,                      '2026-09-25 00:30:00.000'),  -- active - coordinator Aisha Rahman | token: seed-dev-token-02-aisha-rahman
  ('a2000000-0000-4000-8000-000000000003', encode(sha256(convert_to('seed-dev-token-03-kevin-ong',     'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000006', '2026-10-01 02:00:00.000', NULL,                      '2026-09-24 02:00:00.000'),  -- active - coordinator Kevin Ong | token: seed-dev-token-03-kevin-ong
  ('a2000000-0000-4000-8000-000000000004', encode(sha256(convert_to('seed-dev-token-04-ravi-kumar',    'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000008', '2026-10-01 06:15:00.000', NULL,                      '2026-09-24 06:15:00.000'),  -- active - venue staff Ravi Kumar | token: seed-dev-token-04-ravi-kumar
  ('a2000000-0000-4000-8000-000000000005', encode(sha256(convert_to('seed-dev-token-05-hafiz-ismail',  'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000011', '2026-09-30 01:45:00.000', NULL,                      '2026-09-23 01:45:00.000'),  -- active - tech support Hafiz Ismail | token: seed-dev-token-05-hafiz-ismail
  ('a2000000-0000-4000-8000-000000000006', encode(sha256(convert_to('seed-dev-token-06-ethan-goh',     'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000013', '2026-09-29 12:00:00.000', NULL,                      '2026-09-22 12:00:00.000'),  -- active - attendee Ethan Goh | token: seed-dev-token-06-ethan-goh
  ('a2000000-0000-4000-8000-000000000007', encode(sha256(convert_to('seed-dev-token-07-daniel-lim',    'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000002', '2026-09-17 03:00:00.000', NULL,                      '2026-09-10 03:00:00.000'),  -- EXPIRED - organiser Daniel Lim | token: seed-dev-token-07-daniel-lim
  ('a2000000-0000-4000-8000-000000000008', encode(sha256(convert_to('seed-dev-token-08-mei-ling-chua', 'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000007', '2026-09-28 01:00:00.000', '2026-09-21 09:30:00.000', '2026-09-21 01:00:00.000'),  -- REVOKED (logout) - coordinator Mei Ling Chua | token: seed-dev-token-08-mei-ling-chua
  ('a2000000-0000-4000-8000-000000000009', encode(sha256(convert_to('seed-dev-token-09-grace-teo',     'UTF8')), 'hex'), 'a1000000-0000-4000-8000-000000000009', '2026-10-02 02:00:00.000', NULL,                      '2026-09-25 02:00:00.000')   -- active - venue staff Grace Teo | token: seed-dev-token-09-grace-teo
ON CONFLICT ("id") DO NOTHING;
COMMIT;

-- Sanity check (optional): should return the session for Sarah Tan
-- SELECT "id", "userId" FROM "sessions" WHERE "tokenHash" = encode(sha256(convert_to('seed-dev-token-01-sarah-tan', 'UTF8')), 'hex');
