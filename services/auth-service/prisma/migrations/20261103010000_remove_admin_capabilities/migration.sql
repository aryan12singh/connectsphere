-- CS-10 / CS-24 T02: there is no System Administrator and no in-app user,
-- permission or settings administration. Staff accounts and role
-- permissions are seeded; account status changes are a controlled-setup
-- command (auth-service PATCH /internal/users/:id/status, internal key only).
DELETE FROM role_permissions
WHERE permission IN ('users.view', 'users.manage', 'permissions.manage', 'settings.manage', 'audit.view');

-- CS-50 AC5: Technical Support reads failed notification deliveries.
INSERT INTO role_permissions (role, permission)
VALUES ('TECHNICAL_SUPPORT_STAFF', 'notifications.failures.view')
ON CONFLICT DO NOTHING;
