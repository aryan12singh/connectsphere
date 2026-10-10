<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminUser } from '@/composables/useAdminApi'
import NotificationFailures from '@/components/shared/NotificationFailures.vue'
const { can } = usePermissions()
useHead({ title: 'Technical Support | ConnectSphere' })
const { data, error, refresh } = await useFetch<{ users: AdminUser[] }>('/api/admin/users', { immediate: can('users.view') })
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
    <h1 class="text-3xl font-semibold">Technical Support</h1>
    <NuxtLink to="/technical-requests" class="mt-3 inline-block underline">Review technical requirements</NuxtLink>
    <Card class="mt-6">
      <CardHeader><CardTitle>User directory</CardTitle></CardHeader>
      <CardContent>
        <p v-if="!can('users.view')" role="status">Your account does not have permission to view the user directory.</p>
        <div v-else-if="error" role="alert"><p>The user directory is unavailable.</p><button type="button" class="mt-2 underline" @click="refresh()">Try again</button></div>
        <ul v-else class="divide-y divide-border"><li v-for="account in data?.users ?? []" :key="account.id" class="flex flex-wrap justify-between gap-2 py-3"><span>{{ account.firstName }} {{ account.lastName }} — {{ account.email }}</span><span class="text-sm text-muted-foreground">{{ account.isActive ? 'Active' : 'Disabled' }}</span></li></ul>
      </CardContent>
    </Card>
    <NotificationFailures v-if="can('audit.view')" />
  </main>
</template>
