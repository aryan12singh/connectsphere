ALTER TABLE "venue_booking_requests"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "expectedAttendance" INTEGER,
  ADD COLUMN "layout" TEXT,
  ADD COLUMN "facilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "accessibilityNeeds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "turnaroundMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "occupiedStart" TIMESTAMP(3),
  ADD COLUMN "occupiedEnd" TIMESTAMP(3),
  ADD COLUMN "venueVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requirements" JSONB,
  ADD COLUMN "requirementsFingerprint" TEXT,
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve historic IDs/status/history. Legacy holds gain a bounded deadline;
-- already elapsed deadlines are ineffective even before the expiry worker.
UPDATE "venue_booking_requests" SET "occupiedStart" = "requestedStart", "occupiedEnd" = "requestedEnd";
UPDATE "venue_booking_requests" SET "expiresAt" = LEAST("createdAt" + INTERVAL '72 hours', "requestedStart")
  WHERE "status" = 'TENTATIVELY_HELD';
ALTER TABLE "venue_booking_requests" ADD CONSTRAINT "booking_version_positive" CHECK ("version" > 0);
ALTER TABLE "venue_booking_requests" ADD CONSTRAINT "booking_buffers_nonnegative" CHECK ("setupMinutes" >= 0 AND "turnaroundMinutes" >= 0);
CREATE INDEX "booking_event_id" ON "venue_booking_requests"("eventId");
CREATE TABLE "booking_outbox" (
  "id" TEXT PRIMARY KEY,
  "actionKey" TEXT NOT NULL UNIQUE,
  "aggregateId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3)
);
CREATE INDEX "booking_outbox_pending" ON "booking_outbox"("deliveredAt", "createdAt");
