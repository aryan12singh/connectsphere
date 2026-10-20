CREATE TABLE IF NOT EXISTS equipment_stock (
    "equipmentType" TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT equipment_stock_pkey PRIMARY KEY ("equipmentType")
);

INSERT INTO equipment_stock ("equipmentType", total, version, "updatedAt")
SELECT name, 0, 1, CURRENT_TIMESTAMP FROM "EquipmentType"
ON CONFLICT ("equipmentType") DO NOTHING;
