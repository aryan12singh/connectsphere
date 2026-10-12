-- Additive compatibility migration. Existing catalogue/history IDs are retained.
ALTER TABLE "venues"
  ADD COLUMN "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "turnaroundMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "venues"
  ADD CONSTRAINT "venues_setup_nonnegative" CHECK ("setupMinutes" >= 0),
  ADD CONSTRAINT "venues_turnaround_nonnegative" CHECK ("turnaroundMinutes" >= 0),
  ADD CONSTRAINT "venues_version_positive" CHECK ("version" > 0);
-- The configurable upper limit belongs to the service, not an immutable SQL cap.
