ALTER TABLE "TechnicalRequest" ADD COLUMN "planningEventId" TEXT, ADD COLUMN "requirementsRevision" TEXT;
CREATE TABLE technical_readiness_fences (
 token TEXT PRIMARY KEY,"eventId" TEXT NOT NULL,"eventRequestId" TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,
 proof JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX technical_readiness_fences_request ON technical_readiness_fences("eventRequestId",active);
