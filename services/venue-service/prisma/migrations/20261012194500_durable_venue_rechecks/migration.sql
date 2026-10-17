CREATE TABLE "venue_recheck_outbox" (
  "id" TEXT PRIMARY KEY,
  "venueId" TEXT NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  UNIQUE ("venueId", "version")
);
CREATE INDEX "venue_recheck_pending" ON "venue_recheck_outbox"("deliveredAt", "createdAt");
