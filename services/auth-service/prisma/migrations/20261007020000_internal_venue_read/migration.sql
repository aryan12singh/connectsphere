-- CS-33/CS-34: every internal role can view venue information and availability.
-- This grants no venue mutation, ordinary booking creation or decision rights.
INSERT INTO "role_permissions" ("role", "permission")
VALUES ('TECHNICAL_SUPPORT_STAFF', 'venues.view')
ON CONFLICT ("role", "permission") DO NOTHING;
