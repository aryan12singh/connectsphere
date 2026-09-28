/**
 * Permission checks for the UI.
 *
 *   const { can } = usePermissions()
 *   <Button v-if="can('users.manage')">Add user</Button>
 *
 * Hiding a button only keeps the screen tidy. The real check happens on the
 * backend on every request, so the UI can never grant access the server
 * doesn't. Permission names are listed in
 * services/auth-service/src/lib/permissions.js.
 */
export function usePermissions() {
  const { user } = useUserSession()

  const permissions = computed<string[]>(() => user.value?.permissions ?? [])

  // can('users.manage') → true / false
  function can(permission: string) {
    return permissions.value.includes(permission)
  }

  // canAny('users.view', 'users.manage') → true if the user has at least one
  function canAny(...list: string[]) {
    return list.some(can)
  }

  return { permissions, can, canAny }
}
