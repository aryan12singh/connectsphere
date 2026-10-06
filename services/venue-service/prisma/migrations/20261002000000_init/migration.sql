-- Initial venue_db schema (matches prisma/schema.prisma) plus the rules Prisma
-- cannot express: CHECK constraints, GIN indexes and a no-overlap constraint.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "LayoutType" AS ENUM ('THEATRE', 'CLASSROOM', 'BANQUET', 'BOARDROOM', 'U_SHAPE', 'CABARET', 'STANDING');
CREATE TYPE "BlockReason" AS ENUM ('MAINTENANCE', 'PRIVATE_USE', 'PUBLIC_HOLIDAY', 'OTHER');

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibilityTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venues_capacity_positive" CHECK ("capacity" > 0)
);

CREATE TABLE "venue_layouts" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "type" "LayoutType" NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "venue_layouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_layouts_capacity_positive" CHECK ("capacity" > 0)
);

CREATE TABLE "venue_operating_hours" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TEXT,
    "closesAt" TEXT,

    CONSTRAINT "venue_operating_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_hours_day_range" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
    -- Closed days carry no times; open days need both, as HH:MM, opening before closing.
    CONSTRAINT "venue_hours_shape" CHECK (
      ("isClosed" AND "opensAt" IS NULL AND "closesAt" IS NULL)
      OR (NOT "isClosed"
          AND "opensAt"  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          AND "closesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          AND "opensAt" < "closesAt")
    )
);

CREATE TABLE "venue_blocks" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" "BlockReason" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_blocks_end_after_start" CHECK ("endsAt" > "startsAt"),
    -- Two blocks at the same venue may not overlap. '[)' = half-open, so
    -- back-to-back blocks are fine.
    CONSTRAINT "venue_blocks_no_overlap" EXCLUDE USING gist (
      "venueId" WITH =,
      tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
);

CREATE TABLE "venue_staff_assignments" (
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_staff_assignments_pkey" PRIMARY KEY ("venueId", "userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_layouts_venueId_type_key" ON "venue_layouts"("venueId", "type");
CREATE UNIQUE INDEX "venue_operating_hours_venueId_dayOfWeek_key" ON "venue_operating_hours"("venueId", "dayOfWeek");
CREATE INDEX "venue_blocks_venueId_startsAt_idx" ON "venue_blocks"("venueId", "startsAt");
CREATE INDEX "venue_staff_assignments_userId_idx" ON "venue_staff_assignments"("userId");
-- "Venues that have ALL of these facilities / tags" (array @> operator).
CREATE INDEX "venues_facilities_gin" ON "venues" USING GIN ("facilities");
CREATE INDEX "venues_accessibility_gin" ON "venues" USING GIN ("accessibilityTags");

-- AddForeignKey
ALTER TABLE "venue_layouts" ADD CONSTRAINT "venue_layouts_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_operating_hours" ADD CONSTRAINT "venue_operating_hours_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_blocks" ADD CONSTRAINT "venue_blocks_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_staff_assignments" ADD CONSTRAINT "venue_staff_assignments_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
