ALTER TABLE "venues" ADD COLUMN "legacyBufferConfigurationPending" BOOLEAN NOT NULL DEFAULT FALSE;
-- Only the catalogue that existed at the original blanket freeze receives the
-- one-time allowance. New venues and later confirmation fences stay closed.
UPDATE "venues" SET "legacyBufferConfigurationPending"=TRUE
WHERE "buffersLockedAt" IS NOT NULL AND "createdAt" <= (
  SELECT "finished_at" FROM "_prisma_migrations"
  WHERE "migration_name"='20261014043000_freeze_confirmed_buffers'
    AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
  ORDER BY "finished_at" DESC LIMIT 1
);
