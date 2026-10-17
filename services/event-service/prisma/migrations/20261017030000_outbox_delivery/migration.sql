ALTER TABLE outbox ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "lastError" TEXT, ADD COLUMN "suppressedAt" TIMESTAMPTZ(3);
CREATE INDEX outbox_pending_delivery ON outbox ("nextAttemptAt", "createdAt") WHERE "publishedAt" IS NULL AND "suppressedAt" IS NULL;
