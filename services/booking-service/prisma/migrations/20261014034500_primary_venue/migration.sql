CREATE TABLE "event_primary_venues" (
  "eventId" TEXT PRIMARY KEY,
  "bookingId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "actorId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_primary_venues_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_booking_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
