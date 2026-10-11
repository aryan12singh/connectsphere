-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — event-service (event_db)
-- Load AFTER 01_user_db.sql (ids below are user_db users). Idempotent.
-- Dataset "as of" 2026-10-02. All instants carry an explicit +08 offset.
--
-- Users used (see 01_user_db.sql):  Organisers  Sarah …001, Daniel …002 (both
-- Nexus Labs), Priya …003, Marcus …004.  Coordinators  Aisha …005, Kevin …006,
-- Mei Ling …007.
--
-- A request that is "active" for load-balancing = SUBMITTED, RETURNED_FOR_
-- AMENDMENT, or APPROVED with a live event. Current load after this seed:
--   Aisha 2 (R2, R5)   Kevin 2 (R3, R6)   Mei Ling 0
-- so the NEXT submission is auto-assigned to Mei Ling (demo for CS-30).
--
--   R1 Draft, no coordinator            R5 Returned for amendment (Aisha)
--   R2 Submitted → Aisha                R6 Approved → event in Planning (Kevin)
--   R3 Submitted → Kevin                R7 Rejected (Mei Ling), closed
--   R4 Submitted, "Awaiting assignment" (no coordinator)
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO "event_requests"
 ("id","organiserId","organisationId","status","version","eventName","purpose","description","startAt","endAt","timeZone","expectedAttendance","minimumCapacity","preferredLayout","venueType","venueRequirements","accessibilityNeeds","accessibilityDetails","equipmentNeeds","technicalDetails","currentCoordinatorId","submittedAt","decidedById","decidedAt","decisionReason","createdAt","updatedAt")
VALUES
 -- R1: draft (Sarah)
 ('e1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','DRAFT',1,
  'Nexus Labs Hack Night','Internal hackathon',NULL,'2026-12-11 18:00+08','2026-12-12 06:00+08','Asia/Singapore',60,NULL,'CLASSROOM',NULL,NULL,
  ARRAY[]::text[],NULL,ARRAY['wifi']::text[],NULL,NULL,NULL,NULL,NULL,NULL,'2026-09-29 02:00:00','2026-09-29 02:00:00'),
 -- R2: submitted → Aisha (Sarah)
 ('e1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','SUBMITTED',2,
  'Nexus Labs Annual Summit','Customer summit','Keynotes, breakouts and a partner expo.','2026-11-20 09:00+08','2026-11-20 18:00+08','Asia/Singapore',450,400,'THEATRE','Convention centre','Stage and AV booth',
  ARRAY['step_free_access','hearing_loop']::text[],'Two wheelchair spaces near the front',ARRAY['projector','microphones']::text[],'Livestream to 3 sites','a1000000-0000-4000-8000-000000000005','2026-09-24 03:00:00',NULL,NULL,NULL,'2026-09-23 02:00:00','2026-09-24 03:00:00'),
 -- R3: submitted → Kevin (Daniel, same organisation as Sarah)
 ('e1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','SUBMITTED',2,
  'Product Launch Workshop','Customer training','Hands-on workshop for the new release.','2026-11-05 13:00+08','2026-11-05 17:00+08','Asia/Singapore',70,60,'CLASSROOM','Innovation hub','Movable tables',
  ARRAY['step_free_access']::text[],NULL,ARRAY['projector','wifi']::text[],NULL,'a1000000-0000-4000-8000-000000000006','2026-09-26 04:00:00',NULL,NULL,NULL,'2026-09-25 02:00:00','2026-09-26 04:00:00'),
 -- R4: submitted, NO coordinator → "Awaiting assignment" (Marcus)
 ('e1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000003','SUBMITTED',1,
  'Orbit Fintech Roadshow','Investor roadshow',NULL,'2026-11-26 10:00+08','2026-11-26 15:00+08','Asia/Singapore',120,100,'THEATRE','Hall',NULL,
  ARRAY[]::text[],NULL,ARRAY['projector']::text[],NULL,NULL,'2026-10-01 08:00:00',NULL,NULL,NULL,'2026-10-01 07:30:00','2026-10-01 08:00:00'),
 -- R5: returned for amendment (Priya; coordinator Aisha)
 ('e1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','RETURNED_FOR_AMENDMENT',3,
  'GreenLeaf Charity Gala','Fundraising','Annual charity dinner.','2026-12-05 18:00+08','2026-12-05 22:30+08','Asia/Singapore',300,250,'BANQUET','Hall','Catering kitchen access',
  ARRAY['step_free_access','wheelchair_toilet']::text[],NULL,ARRAY['stage','microphones']::text[],NULL,'a1000000-0000-4000-8000-000000000005','2026-09-21 03:00:00','a1000000-0000-4000-8000-000000000005','2026-09-22 05:00:00','Please confirm the catering budget and give a final head count range.','2026-09-20 02:00:00','2026-09-22 05:00:00'),
 -- R6: approved (Sarah; coordinator Kevin) — has an Event in Planning
 ('e1000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','APPROVED',3,
  'Leadership Offsite','Planning retreat','Two-day leadership planning session.','2026-12-03 09:00+08','2026-12-03 17:30+08','Asia/Singapore',20,20,'BOARDROOM','Boardroom','Video conferencing',
  ARRAY['step_free_access']::text[],NULL,ARRAY['video_conferencing','whiteboards']::text[],NULL,'a1000000-0000-4000-8000-000000000006','2026-09-18 03:00:00','a1000000-0000-4000-8000-000000000006','2026-09-19 06:00:00','Feasible; Orchard Boardroom looks suitable.','2026-09-17 02:00:00','2026-09-19 06:00:00'),
 -- R7: rejected (Marcus; coordinator Mei Ling) — closed
 ('e1000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000003','REJECTED',3,
  'Rooftop Product Party','Social','Evening party on a rooftop.','2026-10-30 19:00+08','2026-10-30 23:00+08','Asia/Singapore',500,500,'STANDING','Outdoor',NULL,
  ARRAY[]::text[],NULL,ARRAY[]::text[],NULL,'a1000000-0000-4000-8000-000000000007','2026-09-15 03:00:00','a1000000-0000-4000-8000-000000000007','2026-09-16 04:00:00','No available venue holds 500 standing guests on that date within the notice period.','2026-09-14 02:00:00','2026-09-16 04:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Event created on approval of R6, in Planning.
INSERT INTO "events"
 ("id","eventRequestId","organiserId","organisationId","title","description","startAt","endAt","timeZone","status","version","createdAt","updatedAt")
VALUES
 ('f1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
  'Leadership Offsite','Two-day leadership planning session.','2026-12-03 09:00+08','2026-12-03 17:30+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-19 06:00:00','2026-09-19 06:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Coordinator assignments. R7's coordinator history shows a reassignment:
-- Aisha first, then Mei Ling took over (old one revoked).
INSERT INTO "coordinator_assignments" ("id","eventRequestId","coordinatorId","reason","assignedById","assignedAt","revokedAt","revokedById") VALUES
 ('11000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-09-24 03:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-26 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-09-21 03:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-18 03:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000071','e1000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-09-15 03:00:00+00','2026-09-15 06:00:00+00','a1000000-0000-4000-8000-000000000005'),
 ('11000000-0000-4000-8000-000000000072','e1000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000007','REASSIGNED','a1000000-0000-4000-8000-000000000005','2026-09-15 06:00:00+00',NULL,NULL)
ON CONFLICT ("id") DO NOTHING;

-- Activity history (append-only). Ids derived from a label so reruns are no-ops.
INSERT INTO "activity_log" ("id","eventRequestId","action","fromStatus","toStatus","actorType","actorId","details","createdAt")
SELECT md5('act:'||l)::uuid::text, r, a, f, t, at::"ActorType", NULLIF(who,''), d::jsonb, ts::timestamptz FROM (VALUES
 ('r1-created','e1000000-0000-4000-8000-000000000001','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000001',NULL,'2026-09-29 02:00:00+00'),
 ('r2-created','e1000000-0000-4000-8000-000000000002','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000001',NULL,'2026-09-23 02:00:00+00'),
 ('r2-submitted','e1000000-0000-4000-8000-000000000002','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000001',NULL,'2026-09-24 03:00:00+00'),
 ('r2-assigned','e1000000-0000-4000-8000-000000000002','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM','','{"coordinatorId":"a1000000-0000-4000-8000-000000000005","rule":"least_loaded"}','2026-09-24 03:00:00+00'),
 ('r3-created','e1000000-0000-4000-8000-000000000003','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000002',NULL,'2026-09-25 02:00:00+00'),
 ('r3-submitted','e1000000-0000-4000-8000-000000000003','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000002',NULL,'2026-09-26 04:00:00+00'),
 ('r3-assigned','e1000000-0000-4000-8000-000000000003','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM','','{"coordinatorId":"a1000000-0000-4000-8000-000000000006","rule":"least_loaded"}','2026-09-26 04:00:00+00'),
 ('r4-created','e1000000-0000-4000-8000-000000000004','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000004',NULL,'2026-10-01 07:30:00+00'),
 ('r4-submitted','e1000000-0000-4000-8000-000000000004','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000004','{"note":"no coordinator available"}','2026-10-01 08:00:00+00'),
 ('r5-created','e1000000-0000-4000-8000-000000000005','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000003',NULL,'2026-09-20 02:00:00+00'),
 ('r5-submitted','e1000000-0000-4000-8000-000000000005','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000003',NULL,'2026-09-21 03:00:00+00'),
 ('r5-assigned','e1000000-0000-4000-8000-000000000005','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM','','{"coordinatorId":"a1000000-0000-4000-8000-000000000005","rule":"least_loaded"}','2026-09-21 03:00:00+00'),
 ('r5-returned','e1000000-0000-4000-8000-000000000005','RETURNED','SUBMITTED','RETURNED_FOR_AMENDMENT','USER','a1000000-0000-4000-8000-000000000005','{"comments":"Please confirm the catering budget and give a final head count range."}','2026-09-22 05:00:00+00'),
 ('r6-created','e1000000-0000-4000-8000-000000000006','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000001',NULL,'2026-09-17 02:00:00+00'),
 ('r6-submitted','e1000000-0000-4000-8000-000000000006','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000001',NULL,'2026-09-18 03:00:00+00'),
 ('r6-assigned','e1000000-0000-4000-8000-000000000006','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM','','{"coordinatorId":"a1000000-0000-4000-8000-000000000006","rule":"least_loaded"}','2026-09-18 03:00:00+00'),
 ('r6-approved','e1000000-0000-4000-8000-000000000006','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"notes":"Feasible; Orchard Boardroom looks suitable.","eventId":"f1000000-0000-4000-8000-000000000006","eventStatus":"ARRANGEMENT_PENDING"}','2026-09-19 06:00:00+00'),
 ('r7-created','e1000000-0000-4000-8000-000000000007','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000004',NULL,'2026-09-14 02:00:00+00'),
 ('r7-submitted','e1000000-0000-4000-8000-000000000007','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000004',NULL,'2026-09-15 03:00:00+00'),
 ('r7-assigned','e1000000-0000-4000-8000-000000000007','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM','','{"coordinatorId":"a1000000-0000-4000-8000-000000000005","rule":"least_loaded"}','2026-09-15 03:00:00+00'),
 ('r7-reassigned','e1000000-0000-4000-8000-000000000007','COORDINATOR_REASSIGNED',NULL,NULL,'USER','a1000000-0000-4000-8000-000000000005','{"from":"a1000000-0000-4000-8000-000000000005","to":"a1000000-0000-4000-8000-000000000007"}','2026-09-15 06:00:00+00'),
 ('r7-rejected','e1000000-0000-4000-8000-000000000007','REJECTED','SUBMITTED','REJECTED','USER','a1000000-0000-4000-8000-000000000007','{"reason":"No available venue holds 500 standing guests on that date within the notice period."}','2026-09-16 04:00:00+00')
) AS x(l,r,a,f,t,at,who,d,ts)
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- Sanity checks (optional):
--   at most one open assignment per request → should return 0 rows
--   SELECT "eventRequestId", count(*) FROM coordinator_assignments WHERE "revokedAt" IS NULL GROUP BY 1 HAVING count(*) > 1;
--   current coordinator column agrees with the open assignment → should return 0 rows
--   SELECT r.id FROM event_requests r LEFT JOIN coordinator_assignments a ON a."eventRequestId"=r.id AND a."revokedAt" IS NULL
--    WHERE r."currentCoordinatorId" IS DISTINCT FROM a."coordinatorId";
