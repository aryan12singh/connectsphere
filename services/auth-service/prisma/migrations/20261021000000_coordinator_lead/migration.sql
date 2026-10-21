-- CS-10 Week 7: Event Coordinator Lead default capabilities. Additive and
-- idempotent; existing permissions are preserved.
INSERT INTO role_permissions (role,permission) VALUES
 ('EVENT_COORDINATOR_LEAD','assignments.view'),('EVENT_COORDINATOR_LEAD','events.view')
ON CONFLICT DO NOTHING;
