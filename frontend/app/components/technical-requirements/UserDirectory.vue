<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiErrorMessage } from '@/components/shared/api-error'
import { ROLE_LABELS } from '~~/lib/roles'
import type { AdminUser } from '@/composables/useAdminApi'

// Technical Support user directory (users.view): find an account and, with
// users.manage, deactivate or reactivate it. A Coordinator who still has open
// Events is refused by auth-service until the Lead reassigns them (Session 3).
const admin = useAdminApi()
const { can } = usePermissions()
const canManage = computed(() => can('users.manage'))
const search = ref(''), users = ref<AdminUser[]>([]), total = ref(0)
const loading = ref(false), loadError = ref(''), actionError = ref(''), actionResult = ref(''), busyId = ref('')

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const page = await admin.listUsers({ search: search.value.trim() || undefined })
    users.value = page.users; total.value = page.total
  } catch (e) { loadError.value = apiErrorMessage(e, 'The user directory is unavailable.') }
  finally { loading.value = false }
}
async function setActive(user: AdminUser, isActive: boolean) {
  busyId.value = user.id; actionError.value = ''; actionResult.value = ''
  try {
    const saved = await admin.setUserActive(user.id, isActive)
    users.value = users.value.map(row => row.id === user.id ? { ...row, ...saved } : row)
    actionResult.value = `${user.firstName} ${user.lastName} is now ${isActive ? 'active' : 'deactivated'}.`
  } catch (e) { actionError.value = apiErrorMessage(e, 'Could not change this account. Refresh and try again.') }
  finally { busyId.value = '' }
}
const roles = (user: AdminUser) => (user.roles?.length ? user.roles : [user.role]).map(role => ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role).join(', ')
onMounted(load)
</script>

<template>
  <Card class="mt-6">
    <CardHeader>
      <CardTitle>User directory</CardTitle>
      <CardDescription>Find staff and external accounts. Deactivating an account blocks sign-in and ends its sessions.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <form class="flex flex-wrap gap-2" role="search" @submit.prevent="load">
        <Input v-model="search" aria-label="Search users" placeholder="Name or email" class="max-w-xs" />
        <Button type="submit" variant="outline" :disabled="loading">Search</Button>
      </form>
      <Alert v-if="loadError" variant="destructive"><p class="col-start-2">{{ loadError }}</p></Alert>
      <Alert v-if="actionError" variant="destructive" role="alert"><p class="col-start-2">{{ actionError }}</p></Alert>
      <p v-if="actionResult" role="status" class="text-sm text-muted-foreground">{{ actionResult }}</p>
      <p v-if="!loadError && !loading && users.length === 0" class="text-sm text-muted-foreground">No users match this search.</p>
      <Table v-else-if="users.length" data-testid="user-directory">
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead v-if="canManage"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>
          <TableRow v-for="user in users" :key="user.id">
            <TableCell>{{ user.firstName }} {{ user.lastName }}</TableCell>
            <TableCell class="break-all">{{ user.email }}</TableCell>
            <TableCell>{{ roles(user) }}</TableCell>
            <TableCell><Badge :variant="user.isActive ? 'secondary' : 'outline'">{{ user.isActive ? 'Active' : 'Deactivated' }}</Badge></TableCell>
            <TableCell v-if="canManage" class="text-right">
              <Button size="sm" variant="outline" :disabled="busyId === user.id" @click="setActive(user, !user.isActive)">{{ user.isActive ? 'Deactivate' : 'Reactivate' }}</Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p v-if="total > users.length" class="text-xs text-muted-foreground">Showing {{ users.length }} of {{ total }}. Narrow the search to find others.</p>
    </CardContent>
  </Card>
</template>
