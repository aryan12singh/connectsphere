export type WithdrawalPolicy = { withdrawalEnabled?: boolean; withdrawalCutoffAt?: string | null }
type Registration = { eventId: string; status: string }

export function withdrawalReason(policy: WithdrawalPolicy | undefined, now = Date.now()): string {
  if (!policy || typeof policy.withdrawalEnabled !== 'boolean') return 'Withdrawal rules are unavailable.'
  if (!policy.withdrawalEnabled) return 'The organiser has not enabled registration withdrawal.'
  const cutoff = policy.withdrawalCutoffAt ? Date.parse(policy.withdrawalCutoffAt) : NaN
  if (!Number.isFinite(cutoff) || now > cutoff) return 'The withdrawal deadline has passed or has not been set.'
  return ''
}

export function currentRegistration<T extends Registration>(rows: T[], eventId: string): T | null {
  const matches = rows.filter(row => row.eventId === eventId)
  return matches.find(row => ['CONFIRMED', 'WAITLISTED', 'OFFERED'].includes(row.status)) ?? matches[0] ?? null
}

export function canReregister(registration: { status: string } | null, allowed: boolean): boolean {
  return !registration || (registration.status === 'WITHDRAWN' && allowed)
}

export function canOpenRegistrationPage(user: { role?: string; roles?: string[] } | null | undefined, status: string | null | undefined): boolean {
  return ['CONFIRMED', 'PREPARATION'].includes(status ?? '')
    && ['EVENT_COORDINATOR', 'EVENT_ORGANISER'].some(role => user?.role === role || user?.roles?.includes(role))
}
