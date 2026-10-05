type ErrorPayload = {
  statusMessage?: unknown
  message?: unknown
  error?: {
    message?: unknown
    fields?: Record<string, unknown>
  } | unknown
  data?: {
    error?: {
      message?: unknown
      fields?: Record<string, unknown>
    } | unknown
  }
}

function firstFieldMessage(fields: Record<string, unknown> | undefined) {
  for (const value of Object.values(fields ?? {})) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
}

/** Extracts the user-facing message preserved by the BFF for any failed HTTP response. */
export function apiErrorMessage(caught: unknown, fallback = 'Unable to complete this request. Please try again.') {
  const payload = (caught as { data?: ErrorPayload } | undefined)?.data ?? caught as ErrorPayload | undefined
  const error = payload?.data?.error ?? payload?.error
  if (typeof error === 'object' && error) {
    const serviceError = error as { message?: unknown, fields?: Record<string, unknown> }
    return firstFieldMessage(serviceError.fields)
      ?? (typeof serviceError.message === 'string' ? serviceError.message : undefined)
      ?? (typeof payload?.statusMessage === 'string' ? payload.statusMessage : undefined)
      ?? fallback
  }
  return typeof error === 'string' ? error
    : typeof payload?.statusMessage === 'string' ? payload.statusMessage
      : typeof payload?.message === 'string' ? payload.message
        : fallback
}
