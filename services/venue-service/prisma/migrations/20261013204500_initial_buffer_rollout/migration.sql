CREATE TABLE "venue_buffer_rollouts" (
  "id" TEXT PRIMARY KEY,
  "venueId" TEXT NOT NULL UNIQUE REFERENCES "venues"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "completionReason" TEXT
);
CREATE INDEX "venue_buffer_rollout_pending" ON "venue_buffer_rollouts"("completedAt", "attempts", "createdAt");
