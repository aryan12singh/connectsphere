// Business rules tech support can change without a code change
// (auth_db.auth_settings — always one row, id = 1).
//
// Where each setting takes effect:
//   sessionTtlHours     auth-service, for logins made AFTER the change
//   idleTimeoutMinutes  auth-service, immediately for every session
//   lockout*, password* Keycloak — copied there on every save and at start-up
const prisma = require('../db');
const keycloakAdmin = require('../clients/keycloakAdmin');

// Allowed range for each number setting. Checked before saving.
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

// Fields returned to the admin screen (hides the internal id).
const PUBLIC_FIELDS = {
  ...Object.fromEntries([...Object.keys(NUMBER_RULES), ...BOOLEAN_SETTINGS].map((k) => [k, true])),
  updatedAt: true,
  updatedById: true,
};

async function getSettings() {
  return prisma.authSettings.findUniqueOrThrow({ where: { id: 1 }, select: PUBLIC_FIELDS });
}

/**
 * Checks the changes. Returns a list of error messages (empty = all good).
 * Only the fields present in `changes` are checked; unknown fields are errors.
 */
function validate(changes, current) {
  const errors = [];
  for (const [key, value] of Object.entries(changes)) {
    if (NUMBER_RULES[key]) {
      const { min, max, label } = NUMBER_RULES[key];
      if (!Number.isInteger(value) || value < min || value > max) {
        errors.push(`${label} must be a whole number from ${min} to ${max}`);
      }
    } else if (BOOLEAN_SETTINGS.includes(key)) {
      if (typeof value !== 'boolean') errors.push(`${key} must be true or false`);
    } else {
      errors.push(`Unknown setting: ${key}`);
    }
  }
  // Cross-field rule, checked against the values as they would be after saving.
  const merged = { ...current, ...changes };
  if (errors.length === 0 && merged.lockoutMaxWaitMinutes < merged.lockoutWaitMinutes) {
    errors.push('Longest lockout wait must be at least the first lockout wait');
  }
  return errors;
}

/**
 * Saves the changes and copies the lockout/password rules to Keycloak.
 * If Keycloak rejects them, nothing is saved (the transaction rolls back),
 * so auth_db and Keycloak never disagree.
 * @returns {{ errors?: string[], before?, after? }}
 */
async function updateSettings(changes, actorId) {
  const before = await getSettings();
  const errors = validate(changes, before);
  if (errors.length > 0) return { errors };

  const after = await prisma.$transaction(async (tx) => {
    const saved = await tx.authSettings.update({
      where: { id: 1 },
      data: { ...changes, updatedById: actorId },
      select: PUBLIC_FIELDS,
    });
    await keycloakAdmin.applySecuritySettings(saved); // throws → rollback
    return saved;
  }, { timeout: 15000 }); // room for the Keycloak call (default is 5 s)

  return { before, after };
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
  console.error('Gave up syncing settings to Keycloak. Save the settings screen once to retry.');
}

module.exports = { getSettings, updateSettings, syncKeycloakOnStartup, validate };
