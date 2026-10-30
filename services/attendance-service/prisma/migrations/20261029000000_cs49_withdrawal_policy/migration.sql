ALTER TABLE "events"
  ADD COLUMN "withdrawalEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "withdrawalCutoffAt" TIMESTAMPTZ(3),
  ADD COLUMN "allowReregistration" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "registrations"
  ADD COLUMN "withdrawnAt" TIMESTAMPTZ(3);

DROP INDEX "registrations_eventId_userId_key";
CREATE UNIQUE INDEX "registrations_one_active_per_event_user"
  ON "registrations"("eventId", "userId")
  WHERE "status" = 'CONFIRMED';

CREATE INDEX "registrations_withdrawal_lookup_idx"
  ON "registrations"("eventId", "userId", "registeredAt" DESC);
