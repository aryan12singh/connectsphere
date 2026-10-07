<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
const { user } = useUserSession()
useHead({ title: 'Attendee home | ConnectSphere' })
const { data: profile, error } = await useFetch(`/api/users/${user.value?.id}`)
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
    <h1 class="text-3xl font-semibold">Attendee home</h1>
    <p class="mt-2 text-muted-foreground">Welcome, {{ user?.name }}.</p>
    <Card class="mt-6">
      <CardHeader><CardTitle>Your account</CardTitle></CardHeader>
      <CardContent>
        <p v-if="error" role="alert">Your profile is unavailable. Please try again.</p>
        <dl v-else class="grid gap-3"><div><dt class="text-sm text-muted-foreground">Email</dt><dd>{{ profile?.email }}</dd></div><div><dt class="text-sm text-muted-foreground">Name</dt><dd>{{ profile?.name }}</dd></div></dl>
      </CardContent>
    </Card>
  </main>
</template>
