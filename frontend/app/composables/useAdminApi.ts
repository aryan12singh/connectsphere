/**
 * Calls for the tech support admin screens (through the BFF proxy at
 * server/api/admin/[...path].ts). Each maps to one auth-service admin route.
 *
 *   const admin = useAdminApi()
 *   const { users, total } = await admin.listUsers({ search: 'tan' })
 *   await admin.changeUserRole(id, 'EVENT_COORDINATOR')
 *
 * Errors are thrown as FetchError: `error.statusCode` (400, 403, 409...) and
 * `error.data.error` (message to show). Invalid settings also carry
 * `error.data.details` (one message per bad field).
 */

export type Role = 'EVENT_ORGANISER' | 'EVENT_COORDINATOR' | 'VENUE_STAFF' | 'TECHNICAL_SUPPORT_STAFF' | 'ATTENDEE'

export interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  company: string | null
  isActive: boolean
  createdAt: string
}

export interface NewUser {
  email: string
  firstName: string
  lastName: string
  role: Role
  company?: string | null
  password: string // initial password; must meet the current password rules
}

export interface PermissionMatrix {
  permissions: { key: string, description: string }[]
  roles: Record<Role, string[]>
  protected: Partial<Record<Role, string[]>> // can't be removed from that role
}

export interface AuthSettings {
  sessionTtlHours: number
  idleTimeoutMinutes: number // 0 = off
  lockoutMaxFailures: number
  lockoutWaitMinutes: number
  lockoutMaxWaitMinutes: number
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireLowercase: boolean
  passwordRequireDigit: boolean
  passwordRequireSpecial: boolean
}

export interface AuditEntry {
  id: string
  actorId: string
  action: string
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

interface Page { page: number, pageSize: number, total: number }

export function useAdminApi() {
  return {
    // ── Users (users.view / users.manage) ──
    listUsers: (params: { search?: string, role?: Role | '', page?: number } = {}) =>
      $fetch<Page & { users: AdminUser[] }>('/api/admin/users', { query: params }),

    createUser: (user: NewUser) =>
      $fetch<AdminUser>('/api/admin/users', { method: 'POST', body: user }),

    changeUserRole: (userId: string, role: Role) =>
      $fetch<AdminUser>(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: { role } }),

    setUserActive: (userId: string, isActive: boolean) =>
      $fetch<AdminUser>(`/api/admin/users/${userId}/status`, { method: 'PATCH', body: { isActive } }),

    // ── Role permissions (permissions.manage) ──
    getPermissionMatrix: () =>
      $fetch<PermissionMatrix>('/api/admin/permissions'),

    setRolePermissions: (role: Role, permissions: string[]) =>
      $fetch<{ role: Role, permissions: string[] }>(`/api/admin/roles/${role}/permissions`, { method: 'PUT', body: { permissions } }),

    // ── Settings (settings.manage) — send only the fields that changed ──
    getSettings: () =>
      $fetch<AuthSettings>('/api/admin/settings'),

    updateSettings: (changes: Partial<AuthSettings>) =>
      $fetch<AuthSettings>('/api/admin/settings', { method: 'PUT', body: changes }),

    // ── Audit log (audit.view) ──
    getAuditLog: (page = 1) =>
      $fetch<Page & { entries: AuditEntry[] }>('/api/admin/audit-logs', { query: { page } }),
  }
}
