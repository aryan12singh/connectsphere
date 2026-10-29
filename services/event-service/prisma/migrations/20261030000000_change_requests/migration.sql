CREATE TABLE change_requests (
 id TEXT PRIMARY KEY,
 "eventRequestId" TEXT NOT NULL REFERENCES event_requests(id) ON DELETE RESTRICT,
 "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 "proposedById" TEXT NOT NULL, "proposedByRole" TEXT NOT NULL, scope TEXT NOT NULL,
 affected JSONB NOT NULL, fields JSONB NOT NULL, previous JSONB NOT NULL, reason TEXT NOT NULL,
 "baseRequestVersion" INTEGER NOT NULL, "baseEventVersion" INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
 "decidedById" TEXT, "decidedAt" TIMESTAMPTZ(3), "decisionReason" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX change_requests_request_status_idx ON change_requests("eventRequestId", status);
-- At most one open proposal per request keeps "current values until a decision" simple.
CREATE UNIQUE INDEX change_requests_one_pending ON change_requests("eventRequestId") WHERE status = 'PENDING';
