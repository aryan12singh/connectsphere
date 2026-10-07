-- Forward-only upgrade; retains all requests, assignments, history and replay records.
ALTER TABLE event_requests ADD COLUMN "proposedDate" TEXT, ADD COLUMN "startTime" TEXT,
 ADD COLUMN "endTime" TEXT, ADD COLUMN "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "registrationOpensAt" TIMESTAMPTZ(3), ADD COLUMN "registrationClosesAt" TIMESTAMPTZ(3),
 ADD COLUMN "returnedBaseline" JSONB, ADD COLUMN "revisedAt" TIMESTAMPTZ(3);
UPDATE event_requests SET "proposedDate" = to_char("startAt" AT TIME ZONE "timeZone", 'YYYY-MM-DD'),
 "startTime" = to_char("startAt" AT TIME ZONE "timeZone", 'HH24:MI'),
 "endTime" = to_char("endAt" AT TIME ZONE "timeZone", 'HH24:MI') WHERE "startAt" IS NOT NULL AND "timeZone" IS NOT NULL;
-- Baseline for already returned records is their pre-upgrade saved state.
UPDATE event_requests SET "returnedBaseline" = (to_jsonb(event_requests) - ARRAY['id','organiserId','organisationId','status','version','currentCoordinatorId','submittedAt','decidedById','decidedAt','decisionReason','createdAt','updatedAt','returnedBaseline','revisedAt']) WHERE status = 'RETURNED_FOR_AMENDMENT';
ALTER TABLE event_requests DROP CONSTRAINT event_requests_complete_after_draft;
ALTER TABLE event_requests ADD CONSTRAINT event_requests_complete_after_draft CHECK (
 status IN ('DRAFT', 'RETURNED_FOR_AMENDMENT') OR
 (btrim("eventName") <> '' AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL AND "timeZone" IS NOT NULL AND "expectedAttendance" IS NOT NULL AND "venueType" IS NOT NULL));
ALTER TABLE event_requests ADD CONSTRAINT event_requests_registration_order CHECK (
 "registrationOpensAt" IS NULL OR "registrationClosesAt" IS NULL OR "registrationClosesAt" > "registrationOpensAt");
-- Existing rows receive deterministic order by timestamp/id. The sequence then
-- disambiguates actions written in the same millisecond/transaction.
CREATE SEQUENCE activity_log_sequence_seq;
ALTER TABLE activity_log ADD COLUMN sequence BIGINT;
-- The existing append-only trigger is preserved after this data backfill.
ALTER TABLE activity_log DISABLE TRIGGER activity_log_no_update_delete;
UPDATE activity_log SET sequence = ordered.position FROM
 (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS position FROM activity_log) ordered WHERE ordered.id = activity_log.id;
ALTER TABLE activity_log ENABLE TRIGGER activity_log_no_update_delete;
SELECT setval('activity_log_sequence_seq', COALESCE((SELECT max(sequence) FROM activity_log), 1), EXISTS(SELECT 1 FROM activity_log));
ALTER TABLE activity_log ALTER COLUMN sequence SET DEFAULT nextval('activity_log_sequence_seq'), ALTER COLUMN sequence SET NOT NULL;
ALTER SEQUENCE activity_log_sequence_seq OWNED BY activity_log.sequence;
CREATE UNIQUE INDEX activity_log_sequence_key ON activity_log(sequence);
DROP INDEX "idempotency_records_userId_key_key";
CREATE UNIQUE INDEX "idempotency_records_userId_key_method_path_key" ON idempotency_records("userId", key, method, path);
