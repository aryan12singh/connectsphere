/**
 * BFF password rules — GET /api/auth/password-policy.
 *
 * Live mode: the current rules from auth-service (tech support can change
 * them in /api/admin/settings). Mock mode: the default rules, so the sign-up
 * page still renders. Public: the rules are not secret.
 */
export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireDigit: boolean
  requireSpecial: boolean
  notEmail: boolean
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  notEmail: true,
}

export default defineEventHandler(async (event): Promise<PasswordPolicy> => {
  const { authMode } = useRuntimeConfig(event)
  if (authMode !== 'live')
    return DEFAULT_POLICY
  return backendFetch<PasswordPolicy>(event, '/auth/password-policy')
})
