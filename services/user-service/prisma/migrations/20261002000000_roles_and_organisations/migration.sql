-- Sprint 2 (CS-10 / CS-11 / CS-30 prerequisites): multi-role users and
-- organisations. Written as an EXPAND step: the old "role" column stays, so
-- auth-service and the frontend keep working until they read "roles".

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_name_key" ON "organisations"("name");

-- AlterTable
ALTER TABLE "users"
    ADD COLUMN "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    ADD COLUMN "organisationId" TEXT;

-- Existing users: their one role becomes their only entry in roles.
UPDATE "users" SET "roles" = ARRAY["role"];

-- CreateIndex
CREATE INDEX "users_organisationId_idx" ON "users"("organisationId");

-- AddForeignKey (same database, so a real FK is allowed)
ALTER TABLE "users" ADD CONSTRAINT "users_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules that are NOT expressible in schema.prisma (Prisma ignores them):
--   * a user always has at least one role
--   * the primary role is always one of the roles
-- The trigger below keeps old code working: code that only sets "role"
-- (sign-up, admin create, admin role change) gets "roles" fixed for it.
CREATE OR REPLACE FUNCTION users_sync_roles() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."roles" IS NULL OR cardinality(NEW."roles") = 0 THEN
      NEW."roles" := ARRAY[NEW."role"];
    END IF;
  ELSE
    -- Old-style role change: only "role" was touched, so replace "roles".
    IF NEW."role" IS DISTINCT FROM OLD."role" AND NEW."roles" IS NOT DISTINCT FROM OLD."roles" THEN
      NEW."roles" := ARRAY[NEW."role"];
    END IF;
  END IF;
  -- Keep the primary role inside the array.
  IF NOT (NEW."role" = ANY (NEW."roles")) THEN
    NEW."roles" := array_append(NEW."roles", NEW."role");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_sync_roles_trg
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_sync_roles();

ALTER TABLE "users" ALTER COLUMN "roles" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_roles_not_empty" CHECK (cardinality("roles") > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_role_in_roles" CHECK ("role" = ANY ("roles"));
