ALTER TABLE "venue_booking_requests" ADD COLUMN "extensionCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "extensionRequest" JSONB;
-- Existing approved extensions remain spent; historical outbox rows survive delivery.
UPDATE "venue_booking_requests" b SET "extensionCount" = 1
WHERE EXISTS (SELECT 1 FROM "booking_outbox" o WHERE o."aggregateId" = b.id AND o.kind = 'VenueHoldExtended');
ALTER TABLE "venue_booking_requests" ADD CONSTRAINT "extension_count_range" CHECK ("extensionCount" BETWEEN 0 AND 1);
