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

-- Technical Review demo requests (the Booking and Equipment seeds share these
-- stable IDs). These are approved Planning Events so their confirmed venue
-- bookings and equipment periods can be resolved through the live services.
INSERT INTO "event_requests"
 ("id","organiserId","organisationId","status","version","eventName","purpose","description","startAt","endAt","timeZone","expectedAttendance","minimumCapacity","preferredLayout","venueType","venueRequirements","accessibilityNeeds","accessibilityDetails","equipmentNeeds","technicalDetails","currentCoordinatorId","submittedAt","decidedById","decidedAt","decisionReason","createdAt","updatedAt")
VALUES
 ('e1000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','APPROVED',3,
  'Product Showcase','Customer event','Product demos and keynote presentations.','2027-03-16 09:00+08','2027-03-16 17:00+08','Asia/Singapore',180,150,'THEATRE','Convention centre','Clear sightlines for the presentation.',
  ARRAY['step_free_access']::text[],'Wheelchair spaces near the front',ARRAY['projector','microphones']::text[],'Projector and two handheld microphones.','a1000000-0000-4000-8000-000000000005','2026-10-05 03:00:00+00','a1000000-0000-4000-8000-000000000005','2026-10-06 03:00:00+00','Venue and event plan confirmed.','2026-10-05 02:00:00+00','2026-10-06 03:00:00+00'),
 ('e1000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','APPROVED',3,
  'Community Film Night','Community screening','Outdoor film screening with live introductions.','2027-03-18 17:00+08','2027-03-18 19:30+08','Asia/Singapore',240,200,'THEATRE','Event hall','Audio coverage across the audience area.',
  ARRAY[]::text[],NULL,ARRAY['speaker','lighting']::text[],'Speaker system and stage lighting.','a1000000-0000-4000-8000-000000000006','2026-10-05 04:00:00+00','a1000000-0000-4000-8000-000000000006','2026-10-06 04:00:00+00','Venue and event plan confirmed.','2026-10-05 02:30:00+00','2026-10-06 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "events"
 ("id","eventRequestId","organiserId","organisationId","title","description","startAt","endAt","timeZone","status","version","createdAt","updatedAt")
VALUES
 ('f1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
  'Product Showcase','Product demos and keynote presentations.','2027-03-16 09:00+08','2027-03-16 17:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-10-06 03:00:00+00','2026-10-06 03:00:00+00'),
 ('f1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001',
  'Community Film Night','Outdoor film screening with live introductions.','2027-03-18 17:00+08','2027-03-18 19:30+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-10-06 04:00:00+00','2026-10-06 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "coordinator_assignments" ("id","eventRequestId","coordinatorId","reason","assignedById","assignedAt","revokedAt","revokedById") VALUES
 ('11000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-10-05 03:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-10-05 04:00:00+00',NULL,NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "activity_log" ("id","eventRequestId","action","fromStatus","toStatus","actorType","actorId","details","createdAt") VALUES
 ('12000000-0000-4000-8000-000000000081','e1000000-0000-4000-8000-000000000008','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000001','{"source":"technical-review-demo"}'::jsonb,'2026-10-05 02:00:00+00'),
 ('12000000-0000-4000-8000-000000000082','e1000000-0000-4000-8000-000000000008','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000001','{}'::jsonb,'2026-10-05 03:00:00+00'),
 ('12000000-0000-4000-8000-000000000083','e1000000-0000-4000-8000-000000000008','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM',NULL,'{"coordinatorId":"a1000000-0000-4000-8000-000000000005","rule":"AUTO"}'::jsonb,'2026-10-05 03:00:00+00'),
 ('12000000-0000-4000-8000-000000000084','e1000000-0000-4000-8000-000000000008','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000005','{"eventId":"f1000000-0000-4000-8000-000000000008"}'::jsonb,'2026-10-06 03:00:00+00'),
 ('12000000-0000-4000-8000-000000000091','e1000000-0000-4000-8000-000000000009','REQUEST_CREATED',NULL,'DRAFT','USER','a1000000-0000-4000-8000-000000000002','{"source":"technical-review-demo"}'::jsonb,'2026-10-05 02:30:00+00'),
 ('12000000-0000-4000-8000-000000000092','e1000000-0000-4000-8000-000000000009','SUBMITTED','DRAFT','SUBMITTED','USER','a1000000-0000-4000-8000-000000000002','{}'::jsonb,'2026-10-05 04:00:00+00'),
 ('12000000-0000-4000-8000-000000000093','e1000000-0000-4000-8000-000000000009','COORDINATOR_ASSIGNED',NULL,NULL,'SYSTEM',NULL,'{"coordinatorId":"a1000000-0000-4000-8000-000000000006","rule":"AUTO"}'::jsonb,'2026-10-05 04:00:00+00'),
 ('12000000-0000-4000-8000-000000000094','e1000000-0000-4000-8000-000000000009','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"eventId":"f1000000-0000-4000-8000-000000000009"}'::jsonb,'2026-10-06 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

-- Link the historical booking-state examples to real, approved Planning Events.
-- Their request/Event IDs are deterministic cross-service references.
INSERT INTO "event_requests"
 ("id","organiserId","organisationId","status","version","eventName","purpose","description","startAt","endAt","timeZone","expectedAttendance","minimumCapacity","preferredLayout","venueType","venueRequirements","accessibilityNeeds","accessibilityDetails","equipmentNeeds","technicalDetails","currentCoordinatorId","submittedAt","decidedById","decidedAt","decisionReason","createdAt","updatedAt")
VALUES
 ('e1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','APPROVED',3,'Autumn Product Summit','Business summit','Planning fixture for the tentative venue hold.','2026-11-20 09:00+08','2026-11-20 17:00+08','Asia/Singapore',300,250,'THEATRE','Convention centre','Main presentation room.',ARRAY['step_free_access']::text[],'Step-free access.',ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000005','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000005','2026-09-25 04:05:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:05:00+00'),
 ('e1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','APPROVED',3,'Leadership Workshop','Internal workshop','Planning fixture for the confirmed room booking.','2026-10-21 10:00+08','2026-10-21 14:00+08','Asia/Singapore',200,180,'CLASSROOM','Hall','Workshop room.',ARRAY[]::text[],NULL,ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000006','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000006','2026-09-25 04:10:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:10:00+00'),
 ('e1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','APPROVED',3,'Innovation Demo Day','Technology showcase','Planning fixture for the available venue slot.','2026-12-02 11:00+08','2026-12-02 16:00+08','Asia/Singapore',100,80,'CLASSROOM','Innovation hub','Demonstration space.',ARRAY[]::text[],NULL,ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000006','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000006','2026-09-25 04:15:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:15:00+00'),
 ('e1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','APPROVED',3,'Partner Briefing','Partner meeting','Planning fixture for an unavailable venue period.','2026-10-28 09:00+08','2026-10-28 13:00+08','Asia/Singapore',150,120,'THEATRE','Convention centre','Meeting room.',ARRAY[]::text[],NULL,ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000005','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000005','2026-09-25 04:20:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:20:00+00'),
 ('e1000000-0000-4000-8000-000000000014','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','APPROVED',3,'Training Session','Staff training','Planning fixture for the rejected venue request.','2026-11-04 10:00+08','2026-11-04 12:00+08','Asia/Singapore',80,60,'CLASSROOM','Hall','Training room.',ARRAY[]::text[],NULL,ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000006','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000006','2026-09-25 04:25:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:25:00+00'),
 ('e1000000-0000-4000-8000-000000000015','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','APPROVED',3,'Community Showcase','Community event','Planning fixture for the cancelled venue request.','2026-11-12 10:00+08','2026-11-12 15:00+08','Asia/Singapore',160,120,'CABARET','Innovation hub','Community room.',ARRAY[]::text[],NULL,ARRAY[]::text[],'No technical equipment required.','a1000000-0000-4000-8000-000000000006','2026-09-25 04:00:00+00','a1000000-0000-4000-8000-000000000006','2026-09-25 04:30:00+00','Approved for planning.','2026-09-25 04:00:00+00','2026-09-25 04:30:00+00'),
 ('e1000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','APPROVED',3,'ConnectSphere Spring Showcase','Community technology showcase','A confirmed attendee-facing event fixture.','2027-04-16 09:00+08','2027-04-16 17:00+08','Asia/Singapore',120,120,'THEATRE','PHYSICAL','One accessible theatre room for 120 attendees.',ARRAY['wheelchair_access']::text[],'Step-free access and wheelchair seating.',ARRAY[]::text[],'No equipment or on-site technical support is required.','a1000000-0000-4000-8000-000000000005','2026-10-20 03:00:00+00','a1000000-0000-4000-8000-000000000005','2026-10-20 04:00:00+00','Current venue and Safety arrangements reviewed.','2026-10-20 02:00:00+00','2026-10-20 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

-- This confirmed demo Event is also the active attendee-registration fixture.
UPDATE "event_requests"
SET "venueType"='PHYSICAL',
    "accessibilityNeeds"=ARRAY['wheelchair_access']::text[],
    "registrationEnabled"=true,
    "registrationOpensAt"='2026-10-24 00:00:00+00',
    "registrationClosesAt"='2027-04-15 15:59:00+00'
WHERE "id"='e1000000-0000-4000-8000-000000000016';

INSERT INTO "events" ("id","eventRequestId","organiserId","organisationId","title","description","startAt","endAt","timeZone","status","version","createdAt","updatedAt","safetyState","safetyGeneration","safetyToken","safetyRoundId","confirmedById","confirmedAt") VALUES
 ('f1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Autumn Product Summit','Planning fixture for the tentative venue hold.','2026-11-20 09:00+08','2026-11-20 17:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:05:00+00','2026-09-25 04:05:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','Leadership Workshop','Planning fixture for the confirmed room booking.','2026-10-21 10:00+08','2026-10-21 14:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:10:00+00','2026-09-25 04:10:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','Innovation Demo Day','Planning fixture for the available venue slot.','2026-12-02 11:00+08','2026-12-02 16:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:15:00+00','2026-09-25 04:15:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000013','e1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Partner Briefing','Planning fixture for an unavailable venue period.','2026-10-28 09:00+08','2026-10-28 13:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:20:00+00','2026-09-25 04:20:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000014','e1000000-0000-4000-8000-000000000014','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','Training Session','Planning fixture for the rejected venue request.','2026-11-04 10:00+08','2026-11-04 12:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:25:00+00','2026-09-25 04:25:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000015','e1000000-0000-4000-8000-000000000015','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','Community Showcase','Planning fixture for the cancelled venue request.','2026-11-12 10:00+08','2026-11-12 15:00+08','Asia/Singapore','ARRANGEMENT_PENDING',1,'2026-09-25 04:30:00+00','2026-09-25 04:30:00+00','NOT_SUBMITTED',0,NULL,NULL,NULL,NULL),
 ('f1000000-0000-4000-8000-000000000016','e1000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','ConnectSphere Spring Showcase','A confirmed attendee-facing event fixture.','2027-04-16 09:00+08','2027-04-16 17:00+08','Asia/Singapore','CONFIRMED',3,'2026-10-20 04:00:00+00','2026-10-20 04:00:00+00','APPROVED',1,'seed-safety-event-016-token','13000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000005','2026-10-20 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "coordinator_assignments" ("id","eventRequestId","coordinatorId","reason","assignedById","assignedAt","revokedAt","revokedById") VALUES
 ('11000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000013','e1000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000014','e1000000-0000-4000-8000-000000000014','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000015','e1000000-0000-4000-8000-000000000015','a1000000-0000-4000-8000-000000000006','AUTO',NULL,'2026-09-25 04:00:00+00',NULL,NULL),
 ('11000000-0000-4000-8000-000000000016','e1000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000005','AUTO',NULL,'2026-10-20 03:00:00+00',NULL,NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "activity_log" ("id","eventRequestId","action","fromStatus","toStatus","actorType","actorId","details","createdAt") VALUES
 ('12000000-0000-4000-8000-000000000100','e1000000-0000-4000-8000-000000000010','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000005','{"eventId":"f1000000-0000-4000-8000-000000000010","source":"seed"}'::jsonb,'2026-09-25 04:05:00+00'),
 ('12000000-0000-4000-8000-000000000101','e1000000-0000-4000-8000-000000000011','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"eventId":"f1000000-0000-4000-8000-000000000011","source":"seed"}'::jsonb,'2026-09-25 04:10:00+00'),
 ('12000000-0000-4000-8000-000000000102','e1000000-0000-4000-8000-000000000012','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"eventId":"f1000000-0000-4000-8000-000000000012","source":"seed"}'::jsonb,'2026-09-25 04:15:00+00'),
 ('12000000-0000-4000-8000-000000000103','e1000000-0000-4000-8000-000000000013','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000005','{"eventId":"f1000000-0000-4000-8000-000000000013","source":"seed"}'::jsonb,'2026-09-25 04:20:00+00'),
 ('12000000-0000-4000-8000-000000000104','e1000000-0000-4000-8000-000000000014','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"eventId":"f1000000-0000-4000-8000-000000000014","source":"seed"}'::jsonb,'2026-09-25 04:25:00+00'),
 ('12000000-0000-4000-8000-000000000105','e1000000-0000-4000-8000-000000000015','APPROVED','SUBMITTED','APPROVED','USER','a1000000-0000-4000-8000-000000000006','{"eventId":"f1000000-0000-4000-8000-000000000015","source":"seed"}'::jsonb,'2026-09-25 04:30:00+00'),
 ('12000000-0000-4000-8000-000000000106','e1000000-0000-4000-8000-000000000016','CONFIRMED','ARRANGEMENT_PENDING','CONFIRMED','USER','a1000000-0000-4000-8000-000000000005','{"eventId":"f1000000-0000-4000-8000-000000000016","safetyRoundId":"13000000-0000-4000-8000-000000000016","source":"seed"}'::jsonb,'2026-10-20 04:00:00+00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "safety_rounds" ("id","eventId","number","token","generation","requirementsRevision","snapshot","status","submittedById","submittedAt") VALUES
 ('13000000-0000-4000-8000-000000000016','f1000000-0000-4000-8000-000000000016',1,'seed-safety-event-016-token',1,'171cdff2fb1f3ad3d9458b24f24dc2336b6a49b19bf7941bed2ccdd1874460f6',
  '{"eventId":"f1000000-0000-4000-8000-000000000016","sourceRevision":"a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a","requirementsRevision":"171cdff2fb1f3ad3d9458b24f24dc2336b6a49b19bf7941bed2ccdd1874460f6","eventTitle":"ConnectSphere Spring Showcase","eventStartAt":"2027-04-16T01:00:00.000Z","eventEndAt":"2027-04-16T09:00:00.000Z","timeZone":"Asia/Singapore","attendance":120,"venues":[{"bookingId":"b4000000-0000-4000-8000-000000000010","venueId":"b3000000-0000-4000-8000-000000000001","venueName":"Marina Convention Centre","venueType":"PHYSICAL","expectedAttendance":120,"capacity":800,"layout":"THEATRE","bookingStartAt":"2027-04-16T01:00:00.000Z","bookingEndAt":"2027-04-16T09:00:00.000Z","occupiedStartAt":"2027-04-16T01:00:00.000Z","occupiedEndAt":"2027-04-16T09:00:00.000Z","accessibilityDetails":"Step-free access and wheelchair seating.","venueRequirements":"One accessible theatre room for 120 attendees.","emergencyAccess":null,"accessibilityNeeds":["WHEELCHAIR_ACCESS"],"equipmentPlacement":"","crowdMovement":null,"restrictions":null,"required":true,"flags":[],"bookingVersion":2,"venueVersion":1}],"equipmentStatus":"NOT_REQUIRED","equipment":[],"technicalProof":{"eventId":"f1000000-0000-4000-8000-000000000016","status":"NOT_REQUIRED","equipment":[],"eventRequestId":"e1000000-0000-4000-8000-000000000016","technicalRequestId":"c5000000-0000-4000-8000-000000000016","version":1,"requirementsRevision":"a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a","approvedById":"a1000000-0000-4000-8000-000000000005","approvedAt":"2026-10-20T03:20:00.000Z","placementDetails":"","supportRequired":false,"supportDetails":"","reservations":[],"fingerprint":"d179722f6b0563942eae54f222f199c1d3cd40ac7a7d43e21a51a025862a0444"}}'::jsonb,
  'APPROVE','a1000000-0000-4000-8000-000000000005','2026-10-20 03:30:00+00') ON CONFLICT ("id") DO NOTHING;
-- The earlier approved snapshot is retained as immutable history and marked
-- superseded. The corrected venue/accessibility requirements are reviewed in
-- a new current round so the confirmed Event has a matching Safety proof.
UPDATE "safety_rounds" SET "status"='SUPERSEDED'
WHERE "id"='13000000-0000-4000-8000-000000000016' AND "status"='APPROVE';
INSERT INTO "safety_rounds" ("id","eventId","number","token","generation","requirementsRevision","snapshot","status","submittedById","submittedAt") VALUES
 ('13000000-0000-4000-8000-000000000017','f1000000-0000-4000-8000-000000000016',2,'seed-safety-event-016-token-v2',2,'171cdff2fb1f3ad3d9458b24f24dc2336b6a49b19bf7941bed2ccdd1874460f6',
  '{"eventId":"f1000000-0000-4000-8000-000000000016","sourceRevision":"a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a","requirementsRevision":"171cdff2fb1f3ad3d9458b24f24dc2336b6a49b19bf7941bed2ccdd1874460f6","eventTitle":"ConnectSphere Spring Showcase","eventStartAt":"2027-04-16T01:00:00.000Z","eventEndAt":"2027-04-16T09:00:00.000Z","timeZone":"Asia/Singapore","attendance":120,"venues":[{"bookingId":"b4000000-0000-4000-8000-000000000010","venueId":"b3000000-0000-4000-8000-000000000001","venueName":"Marina Convention Centre","venueType":"PHYSICAL","expectedAttendance":120,"capacity":800,"layout":"THEATRE","bookingStartAt":"2027-04-16T01:00:00.000Z","bookingEndAt":"2027-04-16T09:00:00.000Z","occupiedStartAt":"2027-04-16T01:00:00.000Z","occupiedEndAt":"2027-04-16T09:00:00.000Z","accessibilityDetails":"Step-free access and wheelchair seating.","venueRequirements":"One accessible theatre room for 120 attendees.","emergencyAccess":null,"accessibilityNeeds":["WHEELCHAIR_ACCESS"],"equipmentPlacement":"","crowdMovement":null,"restrictions":null,"required":true,"flags":[],"bookingVersion":2,"venueVersion":1}],"equipmentStatus":"NOT_REQUIRED","equipment":[],"technicalProof":{"eventId":"f1000000-0000-4000-8000-000000000016","status":"NOT_REQUIRED","equipment":[],"eventRequestId":"e1000000-0000-4000-8000-000000000016","technicalRequestId":"c5000000-0000-4000-8000-000000000016","version":1,"requirementsRevision":"a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a","approvedById":"a1000000-0000-4000-8000-000000000005","approvedAt":"2026-10-20T03:20:00.000Z","placementDetails":"","supportRequired":false,"supportDetails":"","reservations":[],"fingerprint":"d179722f6b0563942eae54f222f199c1d3cd40ac7a7d43e21a51a025862a0444"}}'::jsonb,
  'APPROVE','a1000000-0000-4000-8000-000000000005','2026-10-24 00:00:00+00') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "safety_decisions" ("id","roundId","officerId","outcome","reason","privateNotes","areas","rejectedBookingIds","checklist","decidedAt") VALUES
 ('14000000-0000-4000-8000-000000000017','13000000-0000-4000-8000-000000000017','a1000000-0000-4000-8000-000000000031','APPROVE','Reviewed current venue and technical arrangements.','Seed review for the corrected attendee fixture.',ARRAY[]::text[],ARRAY[]::text[],
  '{"attendance":true,"layout":true,"emergencyAccess":true,"accessibility":true,"equipmentPlacement":true,"crowdMovement":true,"restrictions":true}'::jsonb,'2026-10-24 00:15:00+00') ON CONFLICT ("id") DO NOTHING;
UPDATE "events" SET "version"=5,"safetyState"='APPROVED',"safetyGeneration"=2,"safetyToken"='seed-safety-event-016-token-v2',"safetyRoundId"='13000000-0000-4000-8000-000000000017',"confirmedById"='a1000000-0000-4000-8000-000000000005',"confirmedAt"='2026-10-24 00:20:00+00'
 WHERE "id"='f1000000-0000-4000-8000-000000000016' AND "status"='CONFIRMED';
INSERT INTO "activity_log" ("id","eventRequestId","action","fromStatus","toStatus","actorType","actorId","details","createdAt") VALUES
 ('12000000-0000-4000-8000-000000000107','e1000000-0000-4000-8000-000000000016','CONFIRMED','CONFIRMED','CONFIRMED','USER','a1000000-0000-4000-8000-000000000005','{"eventId":"f1000000-0000-4000-8000-000000000016","safetyRoundId":"13000000-0000-4000-8000-000000000017","source":"corrected-seed"}'::jsonb,'2026-10-24 00:20:00+00')
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "safety_decisions" ("id","roundId","officerId","outcome","reason","privateNotes","areas","rejectedBookingIds","checklist","decidedAt") VALUES
 ('14000000-0000-4000-8000-000000000016','13000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000031','APPROVE','Reviewed current event arrangements.','Controlled seed fixture.',ARRAY[]::text[],ARRAY[]::text[],
  '{"attendance":true,"layout":true,"emergencyAccess":true,"accessibility":true,"equipmentPlacement":true,"crowdMovement":true,"restrictions":true}'::jsonb,'2026-10-20 03:45:00+00') ON CONFLICT ("id") DO NOTHING;

INSERT INTO "outbox" ("id","aggregateType","aggregateId","eventType","payload","createdAt") VALUES
 ('15000000-0000-4000-8000-000000000016','Event','f1000000-0000-4000-8000-000000000016','EventConfirmed',
  '{"eventId":"f1000000-0000-4000-8000-000000000016","eventRequestId":"e1000000-0000-4000-8000-000000000016","organiserId":"a1000000-0000-4000-8000-000000000001","coordinatorId":"a1000000-0000-4000-8000-000000000005","eventName":"ConnectSphere Spring Showcase","occurredAt":"2026-10-20T04:00:00.000Z","roundId":"13000000-0000-4000-8000-000000000016","newStatus":"CONFIRMED","attendeeVenueChanged":false,"attendeeMaterialChange":true,"venueNames":["Marina Convention Centre"],"eventVersion":3,"status":"CONFIRMED","title":"ConnectSphere Spring Showcase","description":"A confirmed attendee-facing event fixture.","startAt":"2027-04-16T01:00:00.000Z","endAt":"2027-04-16T09:00:00.000Z","timeZone":"Asia/Singapore","registrationEnabled":true,"registrationOpensAt":"2026-10-24T00:00:00.000Z","registrationClosesAt":"2027-04-15T15:59:00.000Z"}'::jsonb,'2026-10-20 04:00:00+00') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "outbox" ("id","aggregateType","aggregateId","eventType","payload","createdAt") VALUES
 ('15000000-0000-4000-8000-000000000017','Event','f1000000-0000-4000-8000-000000000016','EventConfirmed',
  '{"eventId":"f1000000-0000-4000-8000-000000000016","eventRequestId":"e1000000-0000-4000-8000-000000000016","organiserId":"a1000000-0000-4000-8000-000000000001","coordinatorId":"a1000000-0000-4000-8000-000000000005","eventName":"ConnectSphere Spring Showcase","occurredAt":"2026-10-24T00:20:00.000Z","roundId":"13000000-0000-4000-8000-000000000017","newStatus":"CONFIRMED","attendeeVenueChanged":false,"attendeeMaterialChange":true,"venueNames":["Marina Convention Centre"],"eventVersion":5,"status":"CONFIRMED","title":"ConnectSphere Spring Showcase","description":"A confirmed attendee-facing event fixture.","startAt":"2027-04-16T01:00:00.000Z","endAt":"2027-04-16T09:00:00.000Z","timeZone":"Asia/Singapore","registrationEnabled":true,"registrationOpensAt":"2026-10-24T00:00:00.000Z","registrationClosesAt":"2027-04-15T15:59:00.000Z"}'::jsonb,'2026-10-24 00:20:00+00') ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- Sanity checks (optional):
--   at most one open assignment per request → should return 0 rows
--   SELECT "eventRequestId", count(*) FROM coordinator_assignments WHERE "revokedAt" IS NULL GROUP BY 1 HAVING count(*) > 1;
--   current coordinator column agrees with the open assignment → should return 0 rows
--   SELECT r.id FROM event_requests r LEFT JOIN coordinator_assignments a ON a."eventRequestId"=r.id AND a."revokedAt" IS NULL
--    WHERE r."currentCoordinatorId" IS DISTINCT FROM a."coordinatorId";
