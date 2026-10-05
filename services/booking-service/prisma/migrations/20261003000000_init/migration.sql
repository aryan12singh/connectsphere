-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('AVAILABLE', 'TENTATIVELY_HELD', 'CONFIRMED', 'BLOCKED', 'UNAVAILABLE', 'REJECTED', 'CANCELLED');

CREATE TABLE "venue_booking_requests" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "venueId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedStart" TIMESTAMP(3) NOT NULL,
    "requestedEnd" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "status" "BookingStatus" NOT NULL DEFAULT 'TENTATIVELY_HELD',
    "idempotencyKey" TEXT NOT NULL,
    "statusChangedById" TEXT,
    "statusChangedRole" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_booking_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_booking_activity" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_booking_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venue_booking_requests_venueId_requestedStart_requestedEnd_idx" ON "venue_booking_requests"("venueId", "requestedStart", "requestedEnd");
CREATE INDEX "venue_booking_requests_venueId_status_idx" ON "venue_booking_requests"("venueId", "status");
CREATE UNIQUE INDEX "venue_booking_requests_requestedById_idempotencyKey_key" ON "venue_booking_requests"("requestedById", "idempotencyKey");
CREATE INDEX "venue_booking_activity_bookingId_occurredAt_idx" ON "venue_booking_activity"("bookingId", "occurredAt");
CREATE INDEX "venue_booking_activity_actorId_occurredAt_idx" ON "venue_booking_activity"("actorId", "occurredAt");

ALTER TABLE "venue_booking_activity" ADD CONSTRAINT "venue_booking_activity_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
