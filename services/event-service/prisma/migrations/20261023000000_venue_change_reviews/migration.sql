CREATE TABLE venue_change_reviews (
 id TEXT PRIMARY KEY, "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 "bookingId" TEXT NOT NULL, "bookingVersion" INTEGER NOT NULL, action TEXT NOT NULL,
 proposed JSONB NOT NULL, source JSONB NOT NULL, reason TEXT NOT NULL, "reviewedById" TEXT NOT NULL,
 "requestVersion" INTEGER NOT NULL, "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX venue_change_review_booking_idx ON venue_change_reviews("eventId","bookingId");
