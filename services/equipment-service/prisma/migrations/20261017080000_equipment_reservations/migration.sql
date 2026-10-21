ALTER TABLE "TechnicalRequest"
  ADD COLUMN IF NOT EXISTS "planningEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "requirementsRevision" TEXT,
  ADD COLUMN IF NOT EXISTS "allocationSnapshot" JSONB;

CREATE TABLE IF NOT EXISTS equipment_reservations (
  id TEXT PRIMARY KEY,
  "eventRequestId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "requestVersion" INTEGER NOT NULL CHECK ("requestVersion" >= 1),
  "equipmentType" TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "actorId" TEXT NOT NULL,
  "sourceVersions" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endAt" > "startAt")
);
CREATE INDEX IF NOT EXISTS equipment_reservations_type_period_idx ON equipment_reservations ("equipmentType", active, "startAt", "endAt");
CREATE INDEX IF NOT EXISTS equipment_reservations_request_active_idx ON equipment_reservations ("eventRequestId", active);

CREATE TABLE IF NOT EXISTS equipment_operational_unavailability (
  id TEXT PRIMARY KEY,
  "equipmentType" TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  "actorId" TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endAt" > "startAt")
);
CREATE INDEX IF NOT EXISTS equipment_operational_period_idx ON equipment_operational_unavailability ("equipmentType", "startAt", "endAt");

CREATE TABLE IF NOT EXISTS equipment_availability_checks (
  id TEXT PRIMARY KEY,
  "eventRequestId" TEXT NOT NULL,
  "requestVersion" INTEGER NOT NULL,
  "periodStartAt" TIMESTAMPTZ(3) NOT NULL,
  "periodEndAt" TIMESTAMPTZ(3) NOT NULL,
  result JSONB NOT NULL,
  "checkedById" TEXT NOT NULL,
  "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("periodEndAt" > "periodStartAt")
);
CREATE INDEX IF NOT EXISTS equipment_availability_request_checked_idx ON equipment_availability_checks ("eventRequestId", "checkedAt");

CREATE TABLE IF NOT EXISTS technical_readiness_fences (
  token TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  proof JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS technical_readiness_active_idx ON technical_readiness_fences ("eventRequestId", active);
