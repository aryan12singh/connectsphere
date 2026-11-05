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

export type CancelledEventNotice = { message: string; title: string }

// CS-48 AC3: Attendance answers 409 EVENT_CANCELLED to someone registered for
// an Event that was later cancelled. The Nuxt server route wraps that body, so
// the page receives { error: true, ..., data: { error: { code, message, title } } }.
// `error: true` is a flag, not the service error, so only an object counts.
export function cancelledEventNotice(errorData: unknown): CancelledEventNotice | null {
  const body = errorData as { error?: unknown, data?: { error?: unknown } } | null | undefined
  const detail = [body?.data?.error, body?.error]
    .find((value): value is { code?: unknown, message?: unknown, title?: unknown } => Boolean(value) && typeof value === 'object')
  if (detail?.code !== 'EVENT_CANCELLED') return null
  return {
    message: typeof detail.message === 'string' && detail.message ? detail.message : 'This Event has been cancelled. Registration is closed.',
    title: typeof detail.title === 'string' ? detail.title : '',
  }
}
