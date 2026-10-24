<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useUserSession } from '#imports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const eventId = String(useRoute().params.eventId ?? '')
const { user } = useUserSession()
useHead({ title: 'Event registrations | ConnectSphere' })
const { data: event } = await useFetch<{ title: string, registrationLimit: number | null }>(`/api/attendances/events/${encodeURIComponent(eventId)}`)
const { data: roster, error, refresh } = await useFetch<{
  registrations: Array<{ id: string, userId: string, status: string, registeredAt: string }>,
  confirmedRegistrationCount: number, registrationLimit: number | null, placesRemaining: number | null, overCapacity: boolean
}>(`/api/attendances/events/${encodeURIComponent(eventId)}/registrations`)
const isCoordinator = computed(() => user.value?.role === 'EVENT_COORDINATOR')
const limitInput = ref('')
const saving = ref(false)
const hydrated = ref(false)
const notice = ref('')
const formError = ref('')
if (roster.value?.registrationLimit != null) limitInput.value = String(roster.value.registrationLimit)
onMounted(() => { hydrated.value = true })

async function saveLimit() {
  const registrationLimit = Number(limitInput.value)
  if (!Number.isSafeInteger(registrationLimit) || registrationLimit < 1) {
    formError.value = 'Enter a positive whole number.'
    return
  }
  saving.value = true
  notice.value = ''
  formError.value = ''
  try {
    const result = await $fetch<{ overCapacity: boolean }>('/api/attendances/events/' + encodeURIComponent(eventId) + '/registration-limit', { method: 'PUT', body: { registrationLimit } })
    notice.value = result.overCapacity ? 'Limit saved. Existing registrations exceed the new limit; all are retained and registration is closed.' : 'Registration limit saved.'
    await refresh()
  }
  catch (cause: any) { formError.value = cause?.data?.error?.message || 'Unable to save the registration limit.' }
  finally { saving.value = false }
}
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
    <NuxtLink :to="`/attendances/events/${eventId}`" class="mb-4 inline-block text-sm underline text-muted-foreground">← Back to Event</NuxtLink>
    <h1 class="text-3xl font-semibold">Event registrations</h1>
    <p class="mt-2 text-muted-foreground">{{ event?.title || eventId }}</p>
    <p v-if="error" role="alert" class="mt-4 text-destructive">You are not authorized to view this registration list, or it is unavailable.</p>
    <template v-else-if="roster">
      <Card class="mt-6">
        <CardHeader><CardTitle>Registration capacity</CardTitle></CardHeader>
        <CardContent class="grid gap-3">
          <p>{{ roster.confirmedRegistrationCount }} registered · {{ roster.registrationLimit == null ? 'Limit not set' : `${roster.registrationLimit} attendees` }} · {{ roster.placesRemaining == null ? 'No places available' : `${roster.placesRemaining} places left` }}</p>
          <p v-if="roster.overCapacity" role="status" class="text-destructive">The registration limit is below the number already registered. Existing registrations are retained and further registration is closed.</p>
          <form v-if="isCoordinator" class="flex flex-wrap items-end gap-3" @submit.prevent="saveLimit">
            <label class="grid gap-2 text-sm">Set registration limit<input v-model="limitInput" aria-label="Registration limit" inputmode="numeric" type="number" min="1" step="1" class="rounded-md border bg-background px-3 py-2"></label>
            <Button type="submit" :disabled="saving || !hydrated">{{ saving ? 'Saving…' : 'Save limit' }}</Button>
          </form>
          <p v-if="notice" role="status">{{ notice }}</p>
          <p v-if="formError" role="alert" class="text-destructive">{{ formError }}</p>
        </CardContent>
      </Card>
      <Card class="mt-6">
        <CardHeader><CardTitle>Attendees</CardTitle></CardHeader>
        <CardContent>
          <p v-if="roster.registrations.length === 0" role="status" class="text-sm text-muted-foreground">No one is registered for this event yet.</p>
          <div v-else class="overflow-x-auto rounded-lg border">
            <Table class="w-full text-sm">
              <TableHeader><TableRow class="bg-muted"><TableHead>Attendee ID</TableHead><TableHead>Registered at</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody><TableRow v-for="row in roster.registrations" :key="row.id"><TableCell>{{ row.userId }}</TableCell><TableCell>{{ new Date(row.registeredAt).toLocaleString() }}</TableCell><TableCell><Badge>{{ row.status }}</Badge></TableCell></TableRow></TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </template>
  </main>
</template>
