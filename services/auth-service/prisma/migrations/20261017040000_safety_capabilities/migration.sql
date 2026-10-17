INSERT INTO role_permissions (role,permission) VALUES
 ('SAFETY_OFFICER','safety.view'),('SAFETY_OFFICER','safety.decide'),
 ('EVENT_COORDINATOR','safety.submit'),('EVENT_COORDINATOR','safety.rework'),
 ('EVENT_COORDINATOR','technical.submit'),('EVENT_COORDINATOR','technical.view'),
 ('TECHNICAL_SUPPORT_STAFF','technical.review'),('TECHNICAL_SUPPORT_STAFF','technical.view')
ON CONFLICT DO NOTHING;
