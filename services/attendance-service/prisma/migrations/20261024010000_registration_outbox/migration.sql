CREATE TABLE "attendance_outbox" (
  "id" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "suppressedAt" TIMESTAMPTZ(3),
  CONSTRAINT "attendance_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_outbox_pending_delivery"
  ON "attendance_outbox" ("nextAttemptAt", "createdAt")
  WHERE "deliveredAt" IS NULL AND "suppressedAt" IS NULL;
