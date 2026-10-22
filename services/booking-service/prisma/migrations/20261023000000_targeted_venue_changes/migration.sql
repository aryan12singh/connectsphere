ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REPLACED';
ALTER TABLE venue_booking_requests
 ADD COLUMN "originalBookingId" TEXT REFERENCES venue_booking_requests(id) ON DELETE RESTRICT,
 ADD COLUMN "originalBookingVersion" INTEGER,
 ADD COLUMN "changeReviewId" TEXT,
 ADD COLUMN "resubmittedFromId" TEXT,
 ADD COLUMN "unavailabilityCategory" TEXT,
 ADD COLUMN "unavailabilityNote" TEXT;
CREATE INDEX venue_replacement_origin_idx ON venue_booking_requests("originalBookingId");
CREATE TABLE booking_mutation_receipts (
 id TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, key TEXT NOT NULL, path TEXT NOT NULL,
 fingerprint TEXT NOT NULL, response JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("actorId",key,path)
);
