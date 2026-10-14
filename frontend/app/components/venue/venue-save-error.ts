export function venueSaveFailure(error: unknown, fallback: string): { fields: Record<string, string[]>, notify: boolean } {
  const caught = error as any
  const supplied = caught?.data?.data?.error?.fields ?? caught?.data?.error?.fields ?? caught?.error?.fields
  const fields = Object.fromEntries(
    supplied && typeof supplied === 'object' && !Array.isArray(supplied)
      ? Object.entries(supplied).flatMap(([field, value]) => {
          const messages = Array.isArray(value) ? value.filter((message): message is string => typeof message === 'string' && Boolean(message.trim())) : []
          return messages.length ? [[field, messages]] : []
        })
      : [],
  ) as Record<string, string[]>
  const usable = Object.keys(fields).length > 0
  const status = Number(caught?.statusCode ?? caught?.status ?? caught?.data?.statusCode ?? caught?.response?.status)
  // Validation stays in the form so its alert cannot cover the retry popover.
  return { fields: usable ? fields : { form: [fallback] }, notify: status !== 422 || !usable }
}
