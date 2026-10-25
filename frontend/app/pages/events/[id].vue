<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import EventReadinessDashboard from '@/components/events/EventReadinessDashboard.vue'
import SafetyWorkspace from '@/components/safety/SafetyWorkspace.vue'
import EventVenueArrangements from '@/components/venue/EventVenueArrangements.vue'

const { can } = usePermissions()
const route = useRoute()
const id = String(route.params.id ?? '')
const dashboard = ref<InstanceType<typeof EventReadinessDashboard> | null>(null)
const eventStatusOverride = ref<string | null>(null)

useHead({ title: 'Event activity | ConnectSphere' })

function refreshDashboard(status?: string) {
  if (status)
    eventStatusOverride.value = status
  return dashboard.value?.refresh()
}
</script>

<template>
  <main class="mx-auto w-full max-w-[90rem] px-5 py-8 md:px-8 md:py-10">
    <Button as-child variant="ghost" class="-ml-3 h-9 !text-muted-foreground hover:!text-foreground">
      <NuxtLink to="/">My requests</NuxtLink>
    </Button>

    <EventReadinessDashboard ref="dashboard" :event-id="id" :status-override="eventStatusOverride" class="mt-5" />

    <div class="mt-8 grid gap-8">
      <EventVenueArrangements v-if="can('venue_bookings.create')" :event-id="id" @changed="refreshDashboard" />
      <SafetyWorkspace v-else :event-id="id" @changed="refreshDashboard" />
    </div>
  </main>
</template>
