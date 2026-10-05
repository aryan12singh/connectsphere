import { apiErrorMessage } from '@/components/shared/api-error'
import { toast } from 'vue-sonner'

/** Shared error-toast entry point for failed API requests across modules. */
export function useErrorAlert() {
  function showError(error: unknown, title = 'Unable to complete request') {
    if (!import.meta.client) return
    toast.error(apiErrorMessage(error), { description: title })
  }

  return { showError }
}
