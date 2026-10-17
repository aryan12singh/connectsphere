ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'PREPARATION';
ALTER TABLE events ADD COLUMN "safetyState" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
 ADD COLUMN "safetyGeneration" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "safetyToken" TEXT,
 ADD COLUMN "safetyOperation" JSONB, ADD COLUMN "safetyRoundId" TEXT, ADD COLUMN "safetyRework" JSONB;
CREATE TABLE safety_rounds (
 id TEXT PRIMARY KEY,"eventId" TEXT NOT NULL REFERENCES events(id),number INTEGER NOT NULL,
 token TEXT NOT NULL UNIQUE,generation INTEGER NOT NULL,"requirementsRevision" TEXT NOT NULL,
 snapshot JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',"submittedById" TEXT NOT NULL,
 "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("eventId",number), CHECK(number>0),CHECK(status IN ('PENDING','APPROVE','REJECT','REQUEST_CHANGES','SUPERSEDED'))
);
CREATE INDEX safety_rounds_pending ON safety_rounds(status,"submittedAt");
CREATE TABLE safety_decisions (
 id TEXT PRIMARY KEY,"roundId" TEXT NOT NULL UNIQUE REFERENCES safety_rounds(id),"officerId" TEXT NOT NULL,
 outcome TEXT NOT NULL,reason TEXT NOT NULL,"privateNotes" TEXT NOT NULL,areas TEXT[] NOT NULL,"rejectedBookingIds" TEXT[] NOT NULL,
 checklist JSONB NOT NULL,"decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(outcome IN ('APPROVE','REJECT','REQUEST_CHANGES'))
);
CREATE TABLE preparation_updates (
 id TEXT PRIMARY KEY,"eventId" TEXT NOT NULL,"actorId" TEXT NOT NULL,area TEXT NOT NULL,note TEXT NOT NULL,
 "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(area IN ('VENUE','TECHNICAL')),CHECK(length(trim(note)) BETWEEN 1 AND 2000)
);
CREATE INDEX preparation_updates_event ON preparation_updates("eventId","occurredAt");
CREATE FUNCTION protect_safety_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Safety decisions and submitted review snapshots are immutable'; END $$;
CREATE TRIGGER safety_decisions_immutable BEFORE UPDATE OR DELETE ON safety_decisions FOR EACH ROW EXECUTE FUNCTION protect_safety_history();
CREATE FUNCTION protect_safety_round_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'Submitted Safety review snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER safety_round_snapshot_immutable BEFORE UPDATE OR DELETE ON safety_rounds FOR EACH ROW EXECUTE FUNCTION protect_safety_round_snapshot();
