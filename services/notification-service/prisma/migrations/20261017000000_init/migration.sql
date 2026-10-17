-- CS-50: in-app notifications and message receipts.
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "eventRequestId" TEXT,
    "eventId" TEXT,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notifications_sourceMessageId_recipientId_type_key" ON "notifications"("sourceMessageId", "recipientId", "type");
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt");

CREATE TABLE "message_receipts" (
    "messageId" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "aggregateId" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("messageId")
);
CREATE INDEX "message_receipts_status_updatedAt_idx" ON "message_receipts"("status", "updatedAt");
