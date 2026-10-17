CREATE TABLE event_readiness_fences (
 token TEXT PRIMARY KEY,"eventId" TEXT NOT NULL,generation INTEGER NOT NULL,fingerprint TEXT NOT NULL,
 "venueIds" TEXT[] NOT NULL,snapshot JSONB NOT NULL,active BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX event_readiness_fences_event ON event_readiness_fences("eventId",active);
CREATE UNIQUE INDEX event_readiness_one_active ON event_readiness_fences("eventId") WHERE active;
