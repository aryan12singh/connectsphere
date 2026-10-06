-- Preserve multi-day ISO requests when reopening them in the existing local form.
ALTER TABLE event_requests ADD COLUMN "endDate" TEXT;
UPDATE event_requests SET "endDate" = to_char("endAt" AT TIME ZONE "timeZone", 'YYYY-MM-DD')
 WHERE "endAt" IS NOT NULL AND "timeZone" IS NOT NULL
 AND to_char("endAt" AT TIME ZONE "timeZone", 'YYYY-MM-DD') IS DISTINCT FROM "proposedDate";
UPDATE event_requests SET "returnedBaseline" = jsonb_set("returnedBaseline", '{endDate}',
 COALESCE(to_jsonb(CASE WHEN to_char(("returnedBaseline"->>'endAt')::timestamptz AT TIME ZONE ("returnedBaseline"->>'timeZone'), 'YYYY-MM-DD') IS DISTINCT FROM "returnedBaseline"->>'proposedDate'
 THEN to_char(("returnedBaseline"->>'endAt')::timestamptz AT TIME ZONE ("returnedBaseline"->>'timeZone'), 'YYYY-MM-DD') ELSE NULL END), 'null'::jsonb))
 WHERE "returnedBaseline" IS NOT NULL;
CREATE INDEX "activity_log_eventRequestId_sequence_idx" ON activity_log("eventRequestId", sequence);
