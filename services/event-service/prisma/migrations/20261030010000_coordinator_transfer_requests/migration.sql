-- CS-30: a Coordinator asks the Lead to reassign; the Lead reassigns or declines.
CREATE TABLE coordinator_transfer_requests (
 id TEXT PRIMARY KEY,
 "eventRequestId" TEXT NOT NULL REFERENCES event_requests(id) ON DELETE RESTRICT,
 "requestedById" TEXT NOT NULL,
 reason TEXT NOT NULL,
 "baseRequestVersion" INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FULFILLED','DECLINED','WITHDRAWN')),
 "decidedById" TEXT, "decidedAt" TIMESTAMPTZ(3), "decisionReason" TEXT, "newCoordinatorId" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX coordinator_transfer_requests_request_status_idx ON coordinator_transfer_requests("eventRequestId", status);
-- At most one open transfer request per request.
CREATE UNIQUE INDEX coordinator_transfer_requests_one_pending ON coordinator_transfer_requests("eventRequestId") WHERE status = 'PENDING';
