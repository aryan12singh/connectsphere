-- Initial synthetic stock only; reruns preserve every existing inventory edit.
INSERT INTO equipment_stock ("equipmentType", total, version, "updatedAt") VALUES
  ('projector', 5, 1, CURRENT_TIMESTAMP),
  ('microphone', 5, 1, CURRENT_TIMESTAMP),
  ('speaker', 5, 1, CURRENT_TIMESTAMP),
  ('lighting', 5, 1, CURRENT_TIMESTAMP),
  ('stage', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("equipmentType") DO NOTHING;

-- Two actionable Technical Review examples. Inventory edits are intentionally
-- untouched on reruns; these rows only add demo requests and their audit trail.
INSERT INTO technical_requests (
  id, "eventRequestId", "planningEventId", "coordinatorId", version, status, requirements, "createdAt", "updatedAt"
) VALUES
  ('c5000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000005',1,'PENDING_TECH_REVIEW',
   '{"equipment":[{"equipmentType":"projector","quantity":1},{"equipmentType":"microphone","quantity":2}],"supportRequired":false,"supportDetails":"","placementDetails":"Projector at the stage; microphones at the lectern and audience aisle.","notRequired":false}'::jsonb,'2026-10-06 03:15:00+00','2026-10-06 03:15:00+00'),
  ('c5000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000006',1,'PENDING_TECH_REVIEW',
   '{"equipment":[{"equipmentType":"speaker","quantity":2},{"equipmentType":"lighting","quantity":1}],"supportRequired":false,"supportDetails":"","placementDetails":"Speakers either side of the screen; lighting focused on the presenter area.","notRequired":false}'::jsonb,'2026-10-06 04:15:00+00','2026-10-06 04:15:00+00')
ON CONFLICT ("eventRequestId") DO NOTHING;

INSERT INTO technical_request_history (id, "requestId", version, action, "actorId", "actorRole", details, "createdAt") VALUES
  ('c5100000-0000-4000-8000-000000000008','c5000000-0000-4000-8000-000000000008',1,'TechRequestSubmitted','a1000000-0000-4000-8000-000000000005','EVENT_COORDINATOR','{"source":"compose-seed"}'::jsonb,'2026-10-06 03:15:00+00'),
  ('c5100000-0000-4000-8000-000000000009','c5000000-0000-4000-8000-000000000009',1,'TechRequestSubmitted','a1000000-0000-4000-8000-000000000006','EVENT_COORDINATOR','{"source":"compose-seed"}'::jsonb,'2026-10-06 04:15:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO outbox_events (id, "actionKey", "eventType", payload, "createdAt") VALUES
  ('c5200000-0000-4000-8000-000000000008','TechRequestSubmitted:e1000000-0000-4000-8000-000000000008:v1','TechRequestSubmitted',
   '{"id":"c5000000-0000-4000-8000-000000000008","eventRequestId":"e1000000-0000-4000-8000-000000000008","coordinatorId":"a1000000-0000-4000-8000-000000000005","version":1,"status":"PENDING_TECH_REVIEW","equipment":[{"equipmentType":"projector","quantity":1},{"equipmentType":"microphone","quantity":2}],"supportRequired":false,"supportDetails":"","placementDetails":"Projector at the stage; microphones at the lectern and audience aisle.","notRequired":false}'::jsonb,'2026-10-06 03:15:00+00'),
  ('c5200000-0000-4000-8000-000000000009','TechRequestSubmitted:e1000000-0000-4000-8000-000000000009:v1','TechRequestSubmitted',
   '{"id":"c5000000-0000-4000-8000-000000000009","eventRequestId":"e1000000-0000-4000-8000-000000000009","coordinatorId":"a1000000-0000-4000-8000-000000000006","version":1,"status":"PENDING_TECH_REVIEW","equipment":[{"equipmentType":"speaker","quantity":2},{"equipmentType":"lighting","quantity":1}],"supportRequired":false,"supportDetails":"","placementDetails":"Speakers either side of the screen; lighting focused on the presenter area.","notRequired":false}'::jsonb,'2026-10-06 04:15:00+00')
ON CONFLICT ("actionKey") DO NOTHING;

-- Explicitly approved NOT_REQUIRED proof for the confirmed attendee fixture.
-- The revision matches Event Service's current planning facts for this Event.
INSERT INTO technical_requests (
  id, "eventRequestId", "planningEventId", "requirementsRevision", "coordinatorId",
  version, status, requirements, "decidedById", "decidedAt", "createdAt", "updatedAt"
) VALUES (
  'c5000000-0000-4000-8000-000000000016','e1000000-0000-4000-8000-000000000016','f1000000-0000-4000-8000-000000000016',
  'a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a','a1000000-0000-4000-8000-000000000005',
  1,'NOT_REQUIRED','{"equipment":[],"supportRequired":false,"supportDetails":"","placementDetails":"","notRequired":true}'::jsonb,
  'a1000000-0000-4000-8000-000000000005','2026-10-20 03:20:00+00','2026-10-20 03:20:00+00','2026-10-20 03:20:00+00'
) ON CONFLICT ("eventRequestId") DO NOTHING;
UPDATE technical_requests
SET "requirementsRevision"='a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a'
WHERE id='c5000000-0000-4000-8000-000000000016'
  AND "eventRequestId"='e1000000-0000-4000-8000-000000000016'
  AND status='NOT_REQUIRED';

INSERT INTO technical_request_history (id,"requestId",version,action,"actorId","actorRole",details,"createdAt") VALUES
 ('c5100000-0000-4000-8000-000000000016','c5000000-0000-4000-8000-000000000016',1,'TechRequestDeclaredNotRequired','a1000000-0000-4000-8000-000000000005','EVENT_COORDINATOR','{"source":"confirmed-attendance-seed","requirementsRevision":"a5f5d01b40b0c8bdf94a511e5b0990a78d71c5b8e32e010dc977d0b062aa377a"}'::jsonb,'2026-10-20 03:20:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO outbox_events (id,"actionKey","eventType",payload,"createdAt") VALUES
 ('c5200000-0000-4000-8000-000000000016','TechRequestDeclaredNotRequired:e1000000-0000-4000-8000-000000000016:v1','TechRequestDeclaredNotRequired',
  '{"id":"c5000000-0000-4000-8000-000000000016","eventRequestId":"e1000000-0000-4000-8000-000000000016","planningEventId":"f1000000-0000-4000-8000-000000000016","coordinatorId":"a1000000-0000-4000-8000-000000000005","version":1,"status":"NOT_REQUIRED","equipment":[],"supportRequired":false,"supportDetails":"","placementDetails":"","notRequired":true}'::jsonb,'2026-10-20 03:20:00+00')
ON CONFLICT ("actionKey") DO NOTHING;
