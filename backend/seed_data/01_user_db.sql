-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — user-service (user_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- Each user has a UNIQUE dev password, shown in the row comment.
-- passwordHash = bcrypt (cost 10) computed at load time via pgcrypto crypt()/gen_salt('bf', 10).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- organisations (Sprint 2). Sarah and Daniel share Nexus Labs, so the
-- "Organisers in the same organisation" cases can be demonstrated; Priya and
-- Marcus are each alone in theirs.
INSERT INTO "organisations" ("id", "name", "createdAt", "updatedAt") VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Nexus Labs',           '2026-05-04 02:00:00.000', '2026-05-04 02:00:00.000'),
  ('b1000000-0000-4000-8000-000000000002', 'GreenLeaf Foundation', '2026-05-11 06:30:00.000', '2026-05-11 06:30:00.000'),
  ('b1000000-0000-4000-8000-000000000003', 'Orbit Fintech',        '2026-05-18 01:45:00.000', '2026-05-18 01:45:00.000')
ON CONFLICT ("id") DO NOTHING;

-- users
INSERT INTO "users" ("id", "email", "passwordHash", "firstName", "lastName", "role", "company", "createdAt", "updatedAt") VALUES
  ('a1000000-0000-4000-8000-000000000001', 'sarah.tan@nexuslabs.sg',          crypt('Sarah@CS01!',    gen_salt('bf', 10)), 'Sarah',    'Tan',       'EVENT_ORGANISER',         'Nexus Labs',               '2026-05-04 02:10:00.000', '2026-05-04 02:10:00.000'),  -- U01 EVENT_ORGANISER | pw: Sarah@CS01!
  ('a1000000-0000-4000-8000-000000000002', 'daniel.lim@brightpath.edu.sg',    crypt('Daniel@CS02!',   gen_salt('bf', 10)), 'Daniel',   'Lim',       'EVENT_ORGANISER',         'Nexus Labs',                '2026-05-06 03:25:00.000', '2026-05-06 03:25:00.000'),  -- U02 EVENT_ORGANISER | pw: Daniel@CS02!
  ('a1000000-0000-4000-8000-000000000003', 'priya.raman@greenleaf.org.sg',    crypt('Priya@CS03!',    gen_salt('bf', 10)), 'Priya',    'Raman',     'EVENT_ORGANISER',         'GreenLeaf Foundation',     '2026-05-11 06:40:00.000', '2026-05-11 06:40:00.000'),  -- U03 EVENT_ORGANISER | pw: Priya@CS03!
  ('a1000000-0000-4000-8000-000000000004', 'marcus.wong@orbitfintech.com',    crypt('Marcus@CS04!',   gen_salt('bf', 10)), 'Marcus',   'Wong',      'EVENT_ORGANISER',         'Orbit Fintech',            '2026-05-18 01:55:00.000', '2026-05-18 01:55:00.000'),  -- U04 EVENT_ORGANISER | pw: Marcus@CS04!
  ('a1000000-0000-4000-8000-000000000005', 'aisha.rahman@connectsphere.sg',   crypt('Aisha@CS05!',    gen_salt('bf', 10)), 'Aisha',    'Rahman',    'EVENT_COORDINATOR',       'ConnectSphere',            '2026-05-01 01:00:00.000', '2026-05-01 01:00:00.000'),  -- U05 EVENT_COORDINATOR | pw: Aisha@CS05!
  ('a1000000-0000-4000-8000-000000000006', 'kevin.ong@connectsphere.sg',      crypt('Kevin@CS06!',    gen_salt('bf', 10)), 'Kevin',    'Ong',       'EVENT_COORDINATOR',       'ConnectSphere',            '2026-05-01 01:05:00.000', '2026-05-01 01:05:00.000'),  -- U06 EVENT_COORDINATOR | pw: Kevin@CS06!
  ('a1000000-0000-4000-8000-000000000007', 'meiling.chua@connectsphere.sg',   crypt('MeiLing@CS07!',  gen_salt('bf', 10)), 'Mei Ling', 'Chua',      'EVENT_COORDINATOR',       'ConnectSphere',            '2026-05-01 01:10:00.000', '2026-05-01 01:10:00.000'),  -- U07 EVENT_COORDINATOR | pw: MeiLing@CS07!
  ('a1000000-0000-4000-8000-000000000008', 'ravi.kumar@marinaconvention.sg',  crypt('Ravi@CS08!',     gen_salt('bf', 10)), 'Ravi',     'Kumar',     'VENUE_STAFF',             'Marina Convention Centre', '2026-05-02 02:00:00.000', '2026-05-02 02:00:00.000'),  -- U08 VENUE_STAFF | pw: Ravi@CS08!
  ('a1000000-0000-4000-8000-000000000009', 'grace.teo@harbourfronthall.sg',   crypt('Grace@CS09!',    gen_salt('bf', 10)), 'Grace',    'Teo',       'VENUE_STAFF',             'Harbourfront Hall',        '2026-05-02 02:30:00.000', '2026-05-02 02:30:00.000'),  -- U09 VENUE_STAFF | pw: Grace@CS09!
  ('a1000000-0000-4000-8000-000000000010', 'jonathan.yeo@onenorthhub.sg',     crypt('Jonathan@CS10!', gen_salt('bf', 10)), 'Jonathan', 'Yeo',       'VENUE_STAFF',             'one-north Innovation Hub', '2026-05-02 03:00:00.000', '2026-05-02 03:00:00.000'),  -- U10 VENUE_STAFF | pw: Jonathan@CS10!
  ('a1000000-0000-4000-8000-000000000011', 'hafiz.ismail@connectsphere.sg',   crypt('Hafiz@CS11!',    gen_salt('bf', 10)), 'Hafiz',    'Ismail',    'TECHNICAL_SUPPORT_STAFF', 'ConnectSphere',            '2026-05-01 01:15:00.000', '2026-05-01 01:15:00.000'),  -- U11 TECHNICAL_SUPPORT_STAFF | pw: Hafiz@CS11!
  ('a1000000-0000-4000-8000-000000000012', 'chloe.ng@connectsphere.sg',       crypt('Chloe@CS12!',    gen_salt('bf', 10)), 'Chloe',    'Ng',        'TECHNICAL_SUPPORT_STAFF', 'ConnectSphere',            '2026-05-01 01:20:00.000', '2026-05-01 01:20:00.000'),  -- U12 TECHNICAL_SUPPORT_STAFF | pw: Chloe@CS12!
  ('a1000000-0000-4000-8000-000000000013', 'ethan.goh@gmail.com',             crypt('Ethan@CS13!',    gen_salt('bf', 10)), 'Ethan',    'Goh',       'ATTENDEE',                NULL,                       '2026-06-02 11:12:00.000', '2026-06-02 11:12:00.000'),  -- U13 ATTENDEE | pw: Ethan@CS13!
  ('a1000000-0000-4000-8000-000000000014', 'nur.aisyah@outlook.com',          crypt('Nur@CS14!',      gen_salt('bf', 10)), 'Nur',      'Aisyah',    'ATTENDEE',                'Temasek Polytechnic',      '2026-06-03 04:30:00.000', '2026-06-03 04:30:00.000'),  -- U14 ATTENDEE | pw: Nur@CS14!
  ('a1000000-0000-4000-8000-000000000015', 'ben.koh@kohdesign.sg',            crypt('Benjamin@CS15!', gen_salt('bf', 10)), 'Benjamin', 'Koh',       'ATTENDEE',                'Koh Design Studio',        '2026-06-05 09:45:00.000', '2026-06-05 09:45:00.000'),  -- U15 ATTENDEE | pw: Benjamin@CS15!
  ('a1000000-0000-4000-8000-000000000016', 'lakshmi.pillai@gmail.com',        crypt('Lakshmi@CS16!',  gen_salt('bf', 10)), 'Lakshmi',  'Pillai',    'ATTENDEE',                NULL,                       '2026-06-10 13:05:00.000', '2026-06-10 13:05:00.000'),  -- U16 ATTENDEE | pw: Lakshmi@CS16!
  ('a1000000-0000-4000-8000-000000000017', 'ryan.tay@dbs-mail.com',           crypt('Ryan@CS17!',     gen_salt('bf', 10)), 'Ryan',     'Tay',       'ATTENDEE',                'Tay & Partners',           '2026-06-14 02:20:00.000', '2026-06-14 02:20:00.000'),  -- U17 ATTENDEE | pw: Ryan@CS17!
  ('a1000000-0000-4000-8000-000000000018', 'hannah.seah@yahoo.com',           crypt('Hannah@CS18!',   gen_salt('bf', 10)), 'Hannah',   'Seah',      'ATTENDEE',                NULL,                       '2026-06-21 07:50:00.000', '2026-06-21 07:50:00.000'),  -- U18 ATTENDEE | pw: Hannah@CS18!
  ('a1000000-0000-4000-8000-000000000019', 'weijie.low@lowlogistics.sg',      crypt('WeiJie@CS19!',   gen_salt('bf', 10)), 'Wei Jie',  'Low',       'ATTENDEE',                'Low Logistics',            '2026-06-25 05:15:00.000', '2026-06-25 05:15:00.000'),  -- U19 ATTENDEE | pw: WeiJie@CS19!
  ('a1000000-0000-4000-8000-000000000020', 'olivia.fernandez@gmail.com',      crypt('Olivia@CS20!',   gen_salt('bf', 10)), 'Olivia',   'Fernandez', 'ATTENDEE',                NULL,                       '2026-07-01 10:40:00.000', '2026-07-01 10:40:00.000')   -- U20 ATTENDEE | pw: Olivia@CS20!
ON CONFLICT ("id") DO NOTHING;

-- Sprint 2: organisation links and the multi-role user. These are UPDATEs
-- (not part of the INSERT above) so they also fix a database that was seeded
-- before the roles/organisations migration. Safe to run repeatedly.
UPDATE "users" SET "organisationId" = 'b1000000-0000-4000-8000-000000000001', "company" = 'Nexus Labs'
  WHERE "id" IN ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');   -- Sarah, Daniel
UPDATE "users" SET "organisationId" = 'b1000000-0000-4000-8000-000000000002'
  WHERE "id" = 'a1000000-0000-4000-8000-000000000003';                                               -- Priya
UPDATE "users" SET "organisationId" = 'b1000000-0000-4000-8000-000000000003'
  WHERE "id" = 'a1000000-0000-4000-8000-000000000004';                                               -- Marcus
-- Multi-role user: Priya organises events AND attends other organisers' events.
UPDATE "users" SET "roles" = ARRAY['EVENT_ORGANISER', 'ATTENDEE']::"UserRole"[]
  WHERE "id" = 'a1000000-0000-4000-8000-000000000003';

COMMIT;

-- Sanity check (optional): should return 1 row
-- SELECT email FROM "users" WHERE email = 'sarah.tan@nexuslabs.sg' AND "passwordHash" = crypt('Sarah@CS01!', "passwordHash");
