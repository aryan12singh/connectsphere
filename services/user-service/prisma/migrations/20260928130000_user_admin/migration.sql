-- Lets tech support disable accounts, and makes the unused passwordHash
-- optional for users created through the admin API.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "passwordHash" DROP NOT NULL;
