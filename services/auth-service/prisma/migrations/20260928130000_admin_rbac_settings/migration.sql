-- Adds configurable settings, editable role permissions, the admin audit
-- log and the idle-timeout column. Also inserts the default settings row and
-- the default permissions for each role, so a fresh database works at once.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission")
);

-- CreateTable
CREATE TABLE "auth_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sessionTtlHours" INTEGER NOT NULL DEFAULT 24,
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 0,
    "lockoutMaxFailures" INTEGER NOT NULL DEFAULT 5,
    "lockoutWaitMinutes" INTEGER NOT NULL DEFAULT 1,
    "lockoutMaxWaitMinutes" INTEGER NOT NULL DEFAULT 15,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireLowercase" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireDigit" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSpecial" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "auth_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Default settings (the decisions of 2026-09-28).
INSERT INTO "auth_settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);

-- Default permissions per role. Tech support can change these later
-- (except the two that keep tech support able to manage the system).
INSERT INTO "role_permissions" ("role", "permission") VALUES
  ('TECHNICAL_SUPPORT_STAFF', 'users.view'),
  ('TECHNICAL_SUPPORT_STAFF', 'users.manage'),
  ('TECHNICAL_SUPPORT_STAFF', 'permissions.manage'),
  ('TECHNICAL_SUPPORT_STAFF', 'settings.manage'),
  ('TECHNICAL_SUPPORT_STAFF', 'audit.view'),
  ('EVENT_ORGANISER', 'event_requests.create'),
  ('EVENT_ORGANISER', 'events.view'),
  ('EVENT_ORGANISER', 'messages.send'),
  ('EVENT_COORDINATOR', 'event_requests.review'),
  ('EVENT_COORDINATOR', 'events.view'),
  ('EVENT_COORDINATOR', 'events.confirm'),
  ('EVENT_COORDINATOR', 'venues.view'),
  ('EVENT_COORDINATOR', 'venue_bookings.create'),
  ('EVENT_COORDINATOR', 'messages.send'),
  ('VENUE_STAFF', 'events.view'),
  ('VENUE_STAFF', 'venues.view'),
  ('VENUE_STAFF', 'venues.manage'),
  ('VENUE_STAFF', 'venue_bookings.decide'),
  ('VENUE_STAFF', 'messages.send'),
  ('ATTENDEE', 'events.view'),
  ('ATTENDEE', 'attendance.register');
