-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — user-service (user_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- All users share the dev password: Password123!  (bcrypt, cost 10)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- users
INSERT INTO "users" ("id", "email", "passwordHash", "firstName", "lastName", "role", "company", "createdAt", "updatedAt") VALUES
  ('a1000000-0000-4000-8000-000000000001', 'sarah.tan@nexuslabs.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Sarah', 'Tan', 'EVENT_ORGANISER', 'Nexus Labs', '2026-05-04 02:10:00.000', '2026-05-04 02:10:00.000'),  -- U01 EVENT_ORGANISER
  ('a1000000-0000-4000-8000-000000000002', 'daniel.lim@brightpath.edu.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Daniel', 'Lim', 'EVENT_ORGANISER', 'BrightPath Academy', '2026-05-06 03:25:00.000', '2026-05-06 03:25:00.000'),  -- U02 EVENT_ORGANISER
  ('a1000000-0000-4000-8000-000000000003', 'priya.raman@greenleaf.org.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Priya', 'Raman', 'EVENT_ORGANISER', 'GreenLeaf Foundation', '2026-05-11 06:40:00.000', '2026-05-11 06:40:00.000'),  -- U03 EVENT_ORGANISER
  ('a1000000-0000-4000-8000-000000000004', 'marcus.wong@orbitfintech.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Marcus', 'Wong', 'EVENT_ORGANISER', 'Orbit Fintech', '2026-05-18 01:55:00.000', '2026-05-18 01:55:00.000'),  -- U04 EVENT_ORGANISER
  ('a1000000-0000-4000-8000-000000000005', 'aisha.rahman@connectsphere.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Aisha', 'Rahman', 'EVENT_COORDINATOR', 'ConnectSphere', '2026-05-01 01:00:00.000', '2026-05-01 01:00:00.000'),  -- U05 EVENT_COORDINATOR
  ('a1000000-0000-4000-8000-000000000006', 'kevin.ong@connectsphere.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Kevin', 'Ong', 'EVENT_COORDINATOR', 'ConnectSphere', '2026-05-01 01:05:00.000', '2026-05-01 01:05:00.000'),  -- U06 EVENT_COORDINATOR
  ('a1000000-0000-4000-8000-000000000007', 'meiling.chua@connectsphere.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Mei Ling', 'Chua', 'EVENT_COORDINATOR', 'ConnectSphere', '2026-05-01 01:10:00.000', '2026-05-01 01:10:00.000'),  -- U07 EVENT_COORDINATOR
  ('a1000000-0000-4000-8000-000000000008', 'ravi.kumar@marinaconvention.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Ravi', 'Kumar', 'VENUE_STAFF', 'Marina Convention Centre', '2026-05-02 02:00:00.000', '2026-05-02 02:00:00.000'),  -- U08 VENUE_STAFF
  ('a1000000-0000-4000-8000-000000000009', 'grace.teo@harbourfronthall.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Grace', 'Teo', 'VENUE_STAFF', 'Harbourfront Hall', '2026-05-02 02:30:00.000', '2026-05-02 02:30:00.000'),  -- U09 VENUE_STAFF
  ('a1000000-0000-4000-8000-000000000010', 'jonathan.yeo@onenorthhub.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Jonathan', 'Yeo', 'VENUE_STAFF', 'one-north Innovation Hub', '2026-05-02 03:00:00.000', '2026-05-02 03:00:00.000'),  -- U10 VENUE_STAFF
  ('a1000000-0000-4000-8000-000000000011', 'hafiz.ismail@connectsphere.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Hafiz', 'Ismail', 'TECHNICAL_SUPPORT_STAFF', 'ConnectSphere', '2026-05-01 01:15:00.000', '2026-05-01 01:15:00.000'),  -- U11 TECHNICAL_SUPPORT_STAFF
  ('a1000000-0000-4000-8000-000000000012', 'chloe.ng@connectsphere.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Chloe', 'Ng', 'TECHNICAL_SUPPORT_STAFF', 'ConnectSphere', '2026-05-01 01:20:00.000', '2026-05-01 01:20:00.000'),  -- U12 TECHNICAL_SUPPORT_STAFF
  ('a1000000-0000-4000-8000-000000000013', 'ethan.goh@gmail.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Ethan', 'Goh', 'ATTENDEE', NULL, '2026-06-02 11:12:00.000', '2026-06-02 11:12:00.000'),  -- U13 ATTENDEE
  ('a1000000-0000-4000-8000-000000000014', 'nur.aisyah@outlook.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Nur', 'Aisyah', 'ATTENDEE', 'Temasek Polytechnic', '2026-06-03 04:30:00.000', '2026-06-03 04:30:00.000'),  -- U14 ATTENDEE
  ('a1000000-0000-4000-8000-000000000015', 'ben.koh@kohdesign.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Benjamin', 'Koh', 'ATTENDEE', 'Koh Design Studio', '2026-06-05 09:45:00.000', '2026-06-05 09:45:00.000'),  -- U15 ATTENDEE
  ('a1000000-0000-4000-8000-000000000016', 'lakshmi.pillai@gmail.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Lakshmi', 'Pillai', 'ATTENDEE', NULL, '2026-06-10 13:05:00.000', '2026-06-10 13:05:00.000'),  -- U16 ATTENDEE
  ('a1000000-0000-4000-8000-000000000017', 'ryan.tay@dbs-mail.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Ryan', 'Tay', 'ATTENDEE', 'Tay & Partners', '2026-06-14 02:20:00.000', '2026-06-14 02:20:00.000'),  -- U17 ATTENDEE
  ('a1000000-0000-4000-8000-000000000018', 'hannah.seah@yahoo.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Hannah', 'Seah', 'ATTENDEE', NULL, '2026-06-21 07:50:00.000', '2026-06-21 07:50:00.000'),  -- U18 ATTENDEE
  ('a1000000-0000-4000-8000-000000000019', 'weijie.low@lowlogistics.sg', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Wei Jie', 'Low', 'ATTENDEE', 'Low Logistics', '2026-06-25 05:15:00.000', '2026-06-25 05:15:00.000'),  -- U19 ATTENDEE
  ('a1000000-0000-4000-8000-000000000020', 'olivia.fernandez@gmail.com', '$2b$10$Dbny1a4C1TPhYnSW7Q6CKugkjq.vhRCOW1jHDB/c2/GGZDdRmSa2K', 'Olivia', 'Fernandez', 'ATTENDEE', NULL, '2026-07-01 10:40:00.000', '2026-07-01 10:40:00.000')  -- U20 ATTENDEE
ON CONFLICT ("id") DO NOTHING;
COMMIT;
