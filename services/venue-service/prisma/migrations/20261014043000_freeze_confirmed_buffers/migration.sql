ALTER TABLE "venues" ADD COLUMN "buffersLockedAt" TIMESTAMP(3);
-- Historical confirmation is owned by Booking. Existing rows fail closed until
-- a reviewed legacy configuration policy exists; no cross-database query.
UPDATE "venues" SET "buffersLockedAt" = CURRENT_TIMESTAMP;
