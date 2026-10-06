-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — venue-service (venue_db)
-- Load AFTER 01_user_db.sql (venue staff ids refer to user_db users).
-- Idempotent: every insert is ON CONFLICT DO NOTHING; ids are fixed or derived
-- from md5() so re-running changes nothing. Dataset "as of" 2026-10-02.
-- Five deliberately different venues so search/filter/availability can be shown:
--   V1 big convention centre   V2 mid-size hall   V3 small innovation hub
--   V4 boardroom suite (weekdays only)   V5 outdoor pavilion (weekends, no step-free access)
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO "venues" ("id","name","address","description","capacity","timeZone","facilities","accessibilityTags","isActive","createdAt","updatedAt") VALUES
 ('c1000000-0000-4000-8000-000000000001','Marina Convention Centre','8 Marina Boulevard, Singapore 018981','Large convention centre with a main hall, breakout rooms and a full catering kitchen.',1200,'Asia/Singapore',
   ARRAY['wifi','projector','stage','catering_kitchen','av_booth','parking'], ARRAY['step_free_access','lift','wheelchair_toilet','hearing_loop','accessible_parking'], true,'2026-05-02 02:00:00','2026-05-02 02:00:00'),
 ('c1000000-0000-4000-8000-000000000002','Harbourfront Hall','1 HarbourFront Walk, Singapore 098585','Mid-size hall with fixed stage, popular for ceremonies and talks.',400,'Asia/Singapore',
   ARRAY['wifi','projector','stage','parking'], ARRAY['step_free_access','lift','wheelchair_toilet'], true,'2026-05-02 02:30:00','2026-05-02 02:30:00'),
 ('c1000000-0000-4000-8000-000000000003','one-north Innovation Hub','11 Biopolis Way, Singapore 138667','Flexible hub for workshops and hackathons; movable walls.',150,'Asia/Singapore',
   ARRAY['wifi','projector','whiteboards','video_conferencing'], ARRAY['step_free_access','lift'], true,'2026-05-02 03:00:00','2026-05-02 03:00:00'),
 ('c1000000-0000-4000-8000-000000000004','Orchard Boardroom Suite','260 Orchard Road, Singapore 238855','Executive boardroom and two meeting rooms. Weekdays only.',24,'Asia/Singapore',
   ARRAY['wifi','video_conferencing','whiteboards'], ARRAY['step_free_access','lift','wheelchair_toilet','hearing_loop'], true,'2026-05-03 02:00:00','2026-05-03 02:00:00'),
 ('c1000000-0000-4000-8000-000000000005','Botanic Lawn Pavilion','1 Cluny Road, Singapore 259569','Open-air pavilion on the lawn. Weekends only; weather dependent; uneven ground.',250,'Asia/Singapore',
   ARRAY['stage','parking','catering_kitchen'], ARRAY['accessible_parking'], true,'2026-05-03 03:00:00','2026-05-03 03:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Layouts (capacity per set-up). Ids derived from venue+type so reruns are no-ops.
INSERT INTO "venue_layouts" ("id","venueId","type","capacity")
SELECT md5('layout:'||v||':'||t)::uuid::text, v, t::"LayoutType", c FROM (VALUES
 ('c1000000-0000-4000-8000-000000000001','THEATRE',1200),('c1000000-0000-4000-8000-000000000001','BANQUET',700),('c1000000-0000-4000-8000-000000000001','CLASSROOM',500),('c1000000-0000-4000-8000-000000000001','STANDING',1500),
 ('c1000000-0000-4000-8000-000000000002','THEATRE',400),('c1000000-0000-4000-8000-000000000002','BANQUET',240),('c1000000-0000-4000-8000-000000000002','CABARET',200),
 ('c1000000-0000-4000-8000-000000000003','CLASSROOM',80),('c1000000-0000-4000-8000-000000000003','U_SHAPE',40),('c1000000-0000-4000-8000-000000000003','THEATRE',150),('c1000000-0000-4000-8000-000000000003','CABARET',96),
 ('c1000000-0000-4000-8000-000000000004','BOARDROOM',24),('c1000000-0000-4000-8000-000000000004','U_SHAPE',18),
 ('c1000000-0000-4000-8000-000000000005','THEATRE',250),('c1000000-0000-4000-8000-000000000005','BANQUET',120),('c1000000-0000-4000-8000-000000000005','STANDING',300)
) AS x(v,t,c)
ON CONFLICT ("id") DO NOTHING;

-- Operating hours. ISO weekdays: 1=Mon … 7=Sun. NULL times = closed that day.
INSERT INTO "venue_operating_hours" ("id","venueId","dayOfWeek","isClosed","opensAt","closesAt")
SELECT md5('hours:'||v||':'||d)::uuid::text, v, d, (o IS NULL), o, c FROM (
  -- V1: every day 07:00–23:00
  SELECT 'c1000000-0000-4000-8000-000000000001' AS v, d, '07:00' AS o, '23:00' AS c FROM generate_series(1,7) d
  UNION ALL -- V2: Mon–Sat 09:00–22:00, closed Sunday
  SELECT 'c1000000-0000-4000-8000-000000000002', d, CASE WHEN d=7 THEN NULL ELSE '09:00' END, CASE WHEN d=7 THEN NULL ELSE '22:00' END FROM generate_series(1,7) d
  UNION ALL -- V3: Mon–Fri 08:00–21:00, Sat 09:00–17:00, closed Sunday
  SELECT 'c1000000-0000-4000-8000-000000000003', d, CASE WHEN d=7 THEN NULL WHEN d=6 THEN '09:00' ELSE '08:00' END, CASE WHEN d=7 THEN NULL WHEN d=6 THEN '17:00' ELSE '21:00' END FROM generate_series(1,7) d
  UNION ALL -- V4: Mon–Fri 08:30–18:00, closed weekend
  SELECT 'c1000000-0000-4000-8000-000000000004', d, CASE WHEN d>=6 THEN NULL ELSE '08:30' END, CASE WHEN d>=6 THEN NULL ELSE '18:00' END FROM generate_series(1,7) d
  UNION ALL -- V5: Sat–Sun 08:00–20:00, closed weekdays
  SELECT 'c1000000-0000-4000-8000-000000000005', d, CASE WHEN d<=5 THEN NULL ELSE '08:00' END, CASE WHEN d<=5 THEN NULL ELSE '20:00' END FROM generate_series(1,7) d
) h
ON CONFLICT ("id") DO NOTHING;

-- Blocks (Singapore time, written with +08 so the instant is unambiguous).
INSERT INTO "venue_blocks" ("id","venueId","startsAt","endsAt","reason","note","createdById","createdAt") VALUES
 ('d1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','2026-10-19 07:00+08','2026-10-22 07:00+08','MAINTENANCE','Main hall floor resurfacing','a1000000-0000-4000-8000-000000000008','2026-09-25 03:00:00'),
 ('d1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','2026-11-07 09:00+08','2026-11-07 22:00+08','PRIVATE_USE','Venue owner private function','a1000000-0000-4000-8000-000000000009','2026-09-26 03:00:00'),
 ('d1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000005','2026-11-08 00:00+08','2026-11-09 00:00+08','PUBLIC_HOLIDAY','Deepavali','a1000000-0000-4000-8000-000000000010','2026-09-27 03:00:00'),
 ('d1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000003','2026-10-12 08:00+08','2026-10-12 21:00+08','MAINTENANCE','Network upgrade','a1000000-0000-4000-8000-000000000010','2026-09-28 03:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Venue staff ↔ venues (Ravi → V1, Grace → V2, Jonathan → V3 and V4). V5 has none yet.
INSERT INTO "venue_staff_assignments" ("venueId","userId","createdAt") VALUES
 ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000008','2026-05-02 02:00:00'),
 ('c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000009','2026-05-02 02:30:00'),
 ('c1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000010','2026-05-02 03:00:00'),
 ('c1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000010','2026-05-03 02:00:00')
ON CONFLICT DO NOTHING;

COMMIT;
