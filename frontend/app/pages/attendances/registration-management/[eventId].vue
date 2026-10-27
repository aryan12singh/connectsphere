<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeftIcon, UsersRoundIcon } from '@lucide/vue'
import { useUserSession } from '#imports'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

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
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
    <NuxtLink :to="`/attendances/events/${eventId}`" class="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <ArrowLeftIcon :size="16" aria-hidden="true" />Back to Event
    </NuxtLink>

    <header class="mt-7">
      <p class="text-sm text-muted-foreground">Event {{ eventId }}</p>
      <h1 class="mt-2 text-3xl font-medium tracking-tight md:text-4xl">Event registrations</h1>
      <p class="mt-2 text-base leading-7 text-muted-foreground">{{ event?.title || eventId }}</p>
    </header>

    <p v-if="error" role="alert" class="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      You are not authorized to view this registration list, or it is unavailable.
    </p>

    <template v-else-if="roster">
      <div class="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="registered-attendees-heading">
          <Card class="gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
            <CardHeader class="px-5 pb-0 pt-5 md:px-6 md:pt-6">
              <CardTitle id="registered-attendees-heading" class="text-xl font-medium">Attendees</CardTitle>
            </CardHeader>
            <CardContent class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
              <p v-if="roster.registrations.length === 0" role="status" class="text-sm leading-6 text-muted-foreground">No one is registered for this event yet.</p>
              <ol v-else class="grid gap-3">
                <li v-for="row in roster.registrations" :key="row.id" class="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border px-4 py-3">
                  <div class="min-w-0">
                    <p class="break-all font-medium">{{ row.userId }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">{{ new Date(row.registeredAt).toLocaleString() }}</p>
                  </div>
                  <Badge class="shrink-0">{{ formatStatus(row.status) }}</Badge>
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>

        <aside aria-label="Registration settings">
          <Card class="gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
            <CardHeader class="px-5 pb-0 pt-5 md:px-6 md:pt-6">
              <section aria-label="Registration capacity">
                <CardTitle class="flex items-center gap-2 text-base font-medium leading-6"><UsersRoundIcon :size="18" aria-hidden="true" />Registration capacity</CardTitle>
                <dl class="mt-5 grid gap-3 text-sm">
                  <div class="flex items-baseline justify-between gap-4"><dt class="text-muted-foreground">Registered</dt><dd class="font-semibold">{{ roster.confirmedRegistrationCount }}</dd></div>
                  <div class="flex items-baseline justify-between gap-4"><dt class="text-muted-foreground">Registration limit</dt><dd class="font-semibold">{{ roster.registrationLimit == null ? 'Limit not set' : `${roster.registrationLimit} attendees` }}</dd></div>
                  <div class="flex items-baseline justify-between gap-4"><dt class="text-muted-foreground">Places left</dt><dd class="font-semibold">{{ roster.placesRemaining == null ? 'No places available' : `${roster.placesRemaining} places left` }}</dd></div>
                </dl>
                <p v-if="roster.overCapacity" role="status" class="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm leading-6 text-destructive">The registration limit is below the number already registered. Existing registrations are retained and further registration is closed.</p>
              </section>
            </CardHeader>

            <CardContent v-if="isCoordinator" class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
              <form @submit.prevent="saveLimit">
                <label for="registration-limit" class="block text-sm font-medium">Set registration limit</label>
                <p id="registration-limit-help" class="mt-1 text-sm text-muted-foreground">Use a positive whole number.</p>
                <div class="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input id="registration-limit" v-model="limitInput" aria-describedby="registration-limit-help" aria-label="Registration limit" inputmode="numeric" type="number" min="1" step="1" class="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <Button type="submit" :disabled="saving || !hydrated" class="sm:shrink-0">{{ saving ? 'Saving…' : 'Save limit' }}</Button>
                </div>
                <p v-if="notice" role="status" class="mt-3 text-sm text-success">{{ notice }}</p>
                <p v-if="formError" role="alert" class="mt-3 text-sm text-destructive">{{ formError }}</p>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </template>
  </main>
</template>
