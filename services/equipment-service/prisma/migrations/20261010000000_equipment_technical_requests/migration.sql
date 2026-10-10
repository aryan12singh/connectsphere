CREATE TABLE "EquipmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EquipmentType_name_key" ON "EquipmentType"("name");

CREATE TABLE "TechnicalRequest" (
    "id" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "requirements" JSONB NOT NULL,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TechnicalRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TechnicalRequest_eventRequestId_key" ON "TechnicalRequest"("eventRequestId");

CREATE TABLE "TechnicalRequestHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TechnicalRequestHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TechnicalRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TechnicalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TechnicalRequestHistory_requestId_createdAt_idx" ON "TechnicalRequestHistory"("requestId", "createdAt");

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_actionKey_key" ON "OutboxEvent"("actionKey");
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdempotencyRecord_actorId_key_key" ON "IdempotencyRecord"("actorId", "key");

INSERT INTO "EquipmentType" ("id", "name", "updatedAt") VALUES
    ('eq_projector', 'projector', CURRENT_TIMESTAMP),
    ('eq_microphone', 'microphone', CURRENT_TIMESTAMP),
    ('eq_speaker', 'speaker', CURRENT_TIMESTAMP),
    ('eq_lighting', 'lighting', CURRENT_TIMESTAMP),
    ('eq_stage', 'stage', CURRENT_TIMESTAMP);
