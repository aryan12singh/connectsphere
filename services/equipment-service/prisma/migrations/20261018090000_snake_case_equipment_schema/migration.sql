-- Move the catalog into the stock table before removing its legacy table.
-- Existing totals and versions are authoritative; catalog-only names start at zero.
ALTER TABLE equipment_stock
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE equipment_stock AS stock
SET "createdAt" = catalog."createdAt"
FROM "EquipmentType" AS catalog
WHERE stock."equipmentType" = catalog.name;

INSERT INTO equipment_stock ("equipmentType", total, version, "updatedAt")
SELECT name, 0, 1, CURRENT_TIMESTAMP
FROM "EquipmentType"
ON CONFLICT ("equipmentType") DO NOTHING;

DROP TABLE "EquipmentType";

ALTER TABLE "TechnicalRequest" RENAME TO technical_requests;
ALTER TABLE "TechnicalRequestHistory" RENAME TO technical_request_history;
ALTER TABLE "OutboxEvent" RENAME TO outbox_events;
ALTER TABLE "IdempotencyRecord" RENAME TO idempotency_records;

DROP TABLE equipment_availability_checks;
