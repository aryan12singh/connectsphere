INSERT INTO role_permissions (role, permission)
VALUES ('TECHNICAL_SUPPORT_STAFF', 'events.technical.metadata.view')
ON CONFLICT DO NOTHING;
