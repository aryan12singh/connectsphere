<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useUserSession } from '#imports'

const route = useRoute()
const eventId = String(route.params.eventId ?? '')
const { user } = useUserSession()
useHead({ title: 'Your registration | ConnectSphere' })

const { data: registration, error, refresh } = await useFetch<{
  eventId: string, userId: string, status: string, registeredAt: string
}>(`/api/attendances/registrations/${encodeURIComponent(eventId)}`)

const loading = ref(!registration.value && !error.value)

function statusBadge(status: string) {
  if (status === 'CONFIRMED') return 'bg-success-soft text-success'
  if (status === 'CANCELLED') return 'bg-destructive/10 text-destructive'
  if (status === 'PENDING') return 'bg-warning-soft text-warning'
  return 'bg-muted/50 text-muted'
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
    <NuxtLink to="/attendee" class="inline-block mb-4 underline text-sm text-muted-foreground">← Back to your events</NuxtLink>

    <Card v-if="error" class="mt-6">
      <CardHeader>
        <CardTitle>Registration not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm">You do not have a registration for this event, or you do not have permission to view it.</p>
      </CardContent>
    </Card>

    <Card v-if="registration && !error" class="mt-6">
      <CardHeader>
        <div class="flex flex-col gap-2">
          <CardTitle>Your registration</CardTitle>
          <p class="text-sm text-muted-foreground">Event {{ registration.eventId }}</p>
        </div>
        <Badge :class="statusBadge(registration.status)">{{ registration.status }}</Badge>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Registration status</p>
          <p class="text-sm">{{ registration.status }}</p>
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Registered at</p>
          <p class="text-sm"><time>{{ new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(registration.registeredAt)) }}</time></p>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between">
        <Button as-child variant="outline" disabled>
          Manage registration (coming soon – CS-48)
        </Button>
        <NuxtLink to="/attendee" class="underline text-sm text-muted-foreground">Back to your events</NuxtLink>
      </CardFooter>
    </Card>
  </main>
</template>