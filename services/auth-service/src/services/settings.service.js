// Login and password rules (auth_db.auth_settings — always one row, id = 1),
// seeded by migrations. There is no in-app settings editor (CS-10, CS-24 T02).
//
// Where each setting takes effect:
//   sessionTtlHours     auth-service, for new logins
//   idleTimeoutMinutes  auth-service, for every session
//   lockout*, password* Keycloak — copied there at start-up
const prisma = require('../db');
const keycloakAdmin = require('../clients/keycloakAdmin');

// The number settings (labels document their meaning and allowed range).
const NUMBER_RULES = {
  sessionTtlHours: { min: 1, max: 720, label: 'Session length (hours)' }, // up to 30 days
  idleTimeoutMinutes: { min: 0, max: 1440, label: 'Idle timeout (minutes, 0 = off)' },
  lockoutMaxFailures: { min: 1, max: 20, label: 'Wrong passwords before lockout' },
  lockoutWaitMinutes: { min: 1, max: 60, label: 'First lockout wait (minutes)' },
  lockoutMaxWaitMinutes: { min: 1, max: 1440, label: 'Longest lockout wait (minutes)' },
  passwordMinLength: { min: 8, max: 128, label: 'Minimum password length' }, // 8 is the security floor
};
const BOOLEAN_SETTINGS = [
  'passwordRequireUppercase',
  'passwordRequireLowercase',
  'passwordRequireDigit',
  'passwordRequireSpecial',
];

// Fields returned to callers (hides the internal id).
const PUBLIC_FIELDS = {
  ...Object.fromEntries([...Object.keys(NUMBER_RULES), ...BOOLEAN_SETTINGS].map((k) => [k, true])),
  updatedAt: true,
  updatedById: true,
};

async function getSettings() {
  return prisma.authSettings.findUniqueOrThrow({ where: { id: 1 }, select: PUBLIC_FIELDS });
}

// Keycloak re-imports the realm file (with its default rules) whenever its
// container is recreated. Pushing our saved settings at start-up keeps the
// two in step. Keycloak may still be booting, so retry for ~2 minutes.
async function syncKeycloakOnStartup() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      await keycloakAdmin.applySecuritySettings(await getSettings());
      console.log('Keycloak lockout and password rules synced from auth_db');
      return;
    } catch (err) {
      console.warn(`Keycloak sync attempt ${attempt} failed: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  console.error('Gave up syncing settings to Keycloak. Restart auth-service once Keycloak is up to retry.');
}

module.exports = { getSettings, syncKeycloakOnStartup };
