ALTER TABLE booking_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "lastError" TEXT, ADD COLUMN "suppressedAt" TIMESTAMP(3);
CREATE INDEX booking_outbox_pending_delivery ON booking_outbox ("nextAttemptAt", "createdAt") WHERE "deliveredAt" IS NULL AND "suppressedAt" IS NULL;
