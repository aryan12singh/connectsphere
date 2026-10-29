ALTER TABLE "equipment_reservations"
  ADD COLUMN "releasedAt" TIMESTAMPTZ(3),
  ADD COLUMN "releaseReason" TEXT,
  ADD COLUMN "cancellationActionId" TEXT,
  ADD COLUMN "releasedBy" TEXT;

CREATE INDEX "equipment_reservations_event_release_idx"
  ON "equipment_reservations"("eventId", "active");

ALTER TABLE "outbox_events"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "suppressedAt" TIMESTAMPTZ(3);

CREATE INDEX "outbox_events_delivery_idx"
  ON "outbox_events"("publishedAt", "nextAttemptAt", "createdAt");

DROP INDEX "OutboxEvent_publishedAt_createdAt_idx";
