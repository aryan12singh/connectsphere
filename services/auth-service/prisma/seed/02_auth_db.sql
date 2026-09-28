-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — auth-service (auth_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- tokenHash = sha256(hex) of the plaintext dev token shown in each row comment.
-- userId -> user_db.users.id
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- sessions
INSERT INTO "sessions" ("id", "tokenHash", "userId", "expiresAt", "revokedAt", "createdAt") VALUES
  ('a2000000-0000-4000-8000-000000000001', 'd089257abbdcd2efdf50529dbee96d272c8116830c00877a2b96cae00b923652', 'a1000000-0000-4000-8000-000000000001', '2026-10-02 01:00:00.000', NULL, '2026-09-25 01:00:00.000'),  -- active - organiser Sarah Tan | token: seed-dev-token-01
  ('a2000000-0000-4000-8000-000000000002', '436a85a2bd9e527e5c082a7df883b8301c33054bddccf2f5b550a4a6c9212505', 'a1000000-0000-4000-8000-000000000005', '2026-10-02 00:30:00.000', NULL, '2026-09-25 00:30:00.000'),  -- active - coordinator Aisha Rahman | token: seed-dev-token-02
  ('a2000000-0000-4000-8000-000000000003', '6b554abaf48571a4732e72b9100440d52627aaeb5f43975b337f3ba93e9c6fed', 'a1000000-0000-4000-8000-000000000006', '2026-10-01 02:00:00.000', NULL, '2026-09-24 02:00:00.000'),  -- active - coordinator Kevin Ong | token: seed-dev-token-03
  ('a2000000-0000-4000-8000-000000000004', 'f6c31efd2f2380eab446bf92afadedf3ff3e60016e2d671c3e2b6b35ed1b8c9a', 'a1000000-0000-4000-8000-000000000008', '2026-10-01 06:15:00.000', NULL, '2026-09-24 06:15:00.000'),  -- active - venue staff Ravi Kumar | token: seed-dev-token-04
  ('a2000000-0000-4000-8000-000000000005', 'ee367f4e0fba9a5bb93377d4722af27c5c1b183d14f5b687ac026c9880d79f00', 'a1000000-0000-4000-8000-000000000011', '2026-09-30 01:45:00.000', NULL, '2026-09-23 01:45:00.000'),  -- active - tech support Hafiz Ismail | token: seed-dev-token-05
  ('a2000000-0000-4000-8000-000000000006', '9e5b936dda8894a792112a187ead41f6a9277d011a0a4c1639bf4b831e693c87', 'a1000000-0000-4000-8000-000000000013', '2026-09-29 12:00:00.000', NULL, '2026-09-22 12:00:00.000'),  -- active - attendee Ethan Goh | token: seed-dev-token-06
  ('a2000000-0000-4000-8000-000000000007', 'f1438e201622da844392229f1adc42c7b951e001f45e431e7ee0ef0b72a874f8', 'a1000000-0000-4000-8000-000000000002', '2026-09-17 03:00:00.000', NULL, '2026-09-10 03:00:00.000'),  -- EXPIRED - organiser Daniel Lim | token: seed-dev-token-07
  ('a2000000-0000-4000-8000-000000000008', '30bcbd6b75aee8ae07670abf7557a4d32997f7fd57479c98c0c5dae6cb06d1dd', 'a1000000-0000-4000-8000-000000000007', '2026-09-28 01:00:00.000', '2026-09-21 09:30:00.000', '2026-09-21 01:00:00.000'),  -- REVOKED (logout) - coordinator Mei Ling Chua | token: seed-dev-token-08
  ('a2000000-0000-4000-8000-000000000009', '07ac12fa7f2498cf60bd4957e8b599ba50e7e3cd4066b7fae3e3d8bed26f1379', 'a1000000-0000-4000-8000-000000000009', '2026-10-02 02:00:00.000', NULL, '2026-09-25 02:00:00.000')  -- active - venue staff Grace Teo | token: seed-dev-token-09
ON CONFLICT ("id") DO NOTHING;
COMMIT;
