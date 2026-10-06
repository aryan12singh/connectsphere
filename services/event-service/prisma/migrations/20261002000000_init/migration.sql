-- Initial event_db schema (matches prisma/schema.prisma) plus the rules Prisma
-- cannot express. Search this file for "HAND-WRITTEN" — those parts are not in
-- schema.prisma and must be kept if the migration is ever regenerated.

-- CreateEnum
CREATE TYPE "EventRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED', 'REJECTED');
CREATE TYPE "EventStatus" AS ENUM ('ARRANGEMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'REJECTED');
CREATE TYPE "AssignmentReason" AS ENUM ('AUTO', 'REASSIGNED');
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "event_requests" (
    "id" TEXT NOT NULL,
    "organiserId" TEXT NOT NULL,
    "organisationId" TEXT,
    "status" "EventRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "eventName" TEXT NOT NULL,
    "purpose" TEXT,
    "description" TEXT,
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "timeZone" TEXT,
    "expectedAttendance" INTEGER,
    "minimumCapacity" INTEGER,
    "preferredLayout" TEXT,
    "venueType" TEXT,
    "venueRequirements" TEXT,
    "accessibilityNeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibilityDetails" TEXT,
    "equipmentNeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technicalDetails" TEXT,
    "currentCoordinatorId" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_requests_pkey" PRIMARY KEY ("id"),

    -- HAND-WRITTEN checks ------------------------------------------------
    CONSTRAINT "event_requests_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "event_requests_time_order" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "endAt" > "startAt"),
    CONSTRAINT "event_requests_attendance_positive" CHECK ("expectedAttendance" IS NULL OR "expectedAttendance" > 0),
    -- A Draft may be half-filled; anything past Draft must be complete.
    CONSTRAINT "event_requests_complete_after_draft" CHECK (
      "status" = 'DRAFT'
      OR (btrim("eventName") <> ''
          AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL AND "timeZone" IS NOT NULL
          AND "expectedAttendance" IS NOT NULL AND "venueType" IS NOT NULL)
    ),
    -- Reason / comments: whitespace-only is not allowed, max 500 characters (CS-28).
    CONSTRAINT "event_requests_reason_length" CHECK (
      "decisionReason" IS NULL
      OR (char_length(btrim("decisionReason")) >= 1 AND char_length("decisionReason") <= 500)
    ),
    -- Rejecting or returning always carries an explanation.
    CONSTRAINT "event_requests_reason_required" CHECK (
      "status" NOT IN ('REJECTED', 'RETURNED_FOR_AMENDMENT') OR "decisionReason" IS NOT NULL
    )
);

CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "organiserId" TEXT NOT NULL,
    "organisationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'ARRANGEMENT_PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),

    -- HAND-WRITTEN checks
    CONSTRAINT "events_time_order" CHECK ("endAt" > "startAt"),
    CONSTRAINT "events_confirmed_has_time" CHECK ("status" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL),
    CONSTRAINT "events_cancelled_has_time" CHECK ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL),
    CONSTRAINT "events_completed_has_time" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL)
);

CREATE TABLE "coordinator_assignments" (
    "id" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "reason" "AssignmentReason" NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" TEXT,

    CONSTRAINT "coordinator_assignments_pkey" PRIMARY KEY ("id"),
    -- HAND-WRITTEN
    CONSTRAINT "coordinator_assignments_revoke_order" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "assignedAt")
);

CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id"),
    -- HAND-WRITTEN: a USER action names the user; a SYSTEM action does not.
    CONSTRAINT "activity_log_actor_matches_type" CHECK (
      ("actorType" = 'USER' AND "actorId" IS NOT NULL) OR ("actorType" = 'SYSTEM' AND "actorId" IS NULL)
    )
);

CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_requests_organiserId_status_idx" ON "event_requests"("organiserId", "status");
CREATE INDEX "event_requests_organisationId_idx" ON "event_requests"("organisationId");
CREATE INDEX "event_requests_currentCoordinatorId_status_idx" ON "event_requests"("currentCoordinatorId", "status");
CREATE INDEX "event_requests_status_submittedAt_idx" ON "event_requests"("status", "submittedAt");
CREATE UNIQUE INDEX "events_eventRequestId_key" ON "events"("eventRequestId");
CREATE INDEX "events_status_startAt_idx" ON "events"("status", "startAt");
CREATE INDEX "events_organiserId_idx" ON "events"("organiserId");
CREATE INDEX "coordinator_assignments_eventRequestId_idx" ON "coordinator_assignments"("eventRequestId");
CREATE INDEX "coordinator_assignments_coordinatorId_assignedAt_idx" ON "coordinator_assignments"("coordinatorId", "assignedAt");
CREATE INDEX "activity_log_eventRequestId_createdAt_idx" ON "activity_log"("eventRequestId", "createdAt");
CREATE UNIQUE INDEX "idempotency_records_userId_key_key" ON "idempotency_records"("userId", "key");

-- HAND-WRITTEN: ONE CURRENT COORDINATOR (CS-30).
-- At most one assignment per request may be open (revokedAt IS NULL). Two
-- simultaneous reassignments cannot both succeed: the second INSERT fails with
-- a unique violation, which the API turns into 409.
CREATE UNIQUE INDEX "coordinator_assignments_one_current"
    ON "coordinator_assignments"("eventRequestId") WHERE "revokedAt" IS NULL;

-- HAND-WRITTEN: relay only reads rows still waiting to be published.
CREATE INDEX "outbox_unpublished_idx" ON "outbox"("createdAt") WHERE "publishedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "event_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coordinator_assignments" ADD CONSTRAINT "coordinator_assignments_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "event_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "event_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HAND-WRITTEN: the activity log is append-only (auditability, Week 1).
-- Nobody — including a buggy query — can edit or delete history.
CREATE FUNCTION activity_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "activity_log"
  FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();
