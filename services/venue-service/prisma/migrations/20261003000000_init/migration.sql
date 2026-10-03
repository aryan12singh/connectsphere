-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('PHYSICAL', 'VIRTUAL', 'HYBRID');
CREATE TYPE "VenueLayout" AS ENUM ('THEATRE', 'CLASSROOM', 'CABARET');
CREATE TYPE "VenueWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "venueType" "VenueType" NOT NULL DEFAULT 'PHYSICAL',
    "supportedLayouts" "VenueLayout"[],
    "facilities" TEXT[],
    "accessibilityTags" TEXT[],
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "managedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_operating_hours" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "weekday" "VenueWeekday" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TEXT,
    "closesAt" TEXT,
    CONSTRAINT "venue_operating_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_history" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venues_isActive_idx" ON "venues"("isActive");
CREATE UNIQUE INDEX "venue_operating_hours_venueId_weekday_key" ON "venue_operating_hours"("venueId", "weekday");
CREATE INDEX "venue_history_venueId_occurredAt_idx" ON "venue_history"("venueId", "occurredAt");

ALTER TABLE "venue_operating_hours" ADD CONSTRAINT "venue_operating_hours_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_history" ADD CONSTRAINT "venue_history_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
