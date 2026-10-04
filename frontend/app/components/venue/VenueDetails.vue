<script setup lang="ts">
import { computed, watch } from 'vue'
import { BoxesIcon, Building2Icon, HashIcon, HistoryIcon, LayoutGridIcon } from '@lucide/vue'

interface Venue { id: string, venueType?: string, supportedLayouts?: string[], facilities?: string[], accessibilityTags?: string[] }
const props = defineProps<{ venue: Venue }>()
const { data, error } = await useFetch(() => `/api/venues/${props.venue.id}/history/combined`, { watch: [() => props.venue.id] })
const { showError } = useErrorAlert()
watch(error, value => { if (value) showError(value, 'Unable to load venue history') }, { immediate: true })
const history = computed(() => ((data.value as { items?: Array<{ id: string, occurredAt?: string, actorId?: string, action?: string, reason?: string }> } | null)?.items ?? []).slice(0, 3))
</script>

<template>
  <section class="mt-8 grid max-w-xl gap-6 text-sm">
    <div><h3 class="flex items-center gap-2 font-medium"><Building2Icon class="size-4 text-primary" />Venue Type</h3><p class="mt-2">{{ venue.venueType ? venue.venueType[0] + venue.venueType.slice(1).toLowerCase() : '—' }}</p></div>
    <div><h3 class="flex items-center gap-2 font-medium"><LayoutGridIcon class="size-4 text-primary" />Supported layouts</h3><ul class="mt-2 list-disc space-y-1 pl-5"><li v-for="layout in venue.supportedLayouts ?? []" :key="layout">{{ layout[0] + layout.slice(1).toLowerCase() }}</li></ul></div>
    <div><h3 class="flex items-center gap-2 font-medium"><BoxesIcon class="size-4 text-primary" />Amenities available in this venue</h3><p class="mt-2 text-xs text-muted-foreground">Equipment</p><ul class="mt-1 list-disc space-y-1 pl-5"><li v-for="facility in venue.facilities ?? []" :key="facility">{{ facility.replaceAll('_', ' ').toLowerCase() }}</li></ul><p class="mt-3 text-xs text-muted-foreground">Accessibility tags</p><ul class="mt-1 list-disc space-y-1 pl-5"><li v-for="tag in venue.accessibilityTags ?? []" :key="tag">{{ tag.replaceAll('_', ' ').toLowerCase() }}</li></ul></div>
    <div><h3 class="flex items-center gap-2 font-medium"><HashIcon class="size-4 text-primary" />Venue ID</h3><p class="mt-2 break-all">{{ venue.id }}</p></div>
    <div><h3 class="flex items-center gap-2 font-medium"><HistoryIcon class="size-4 text-primary" />Version history</h3><ol class="mt-3 grid gap-4 border-l border-border pl-4"><li v-for="entry in history" :key="entry.id"><p>{{ entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : 'Latest' }}</p><p class="mt-1 text-muted-foreground">{{ entry.actorId || 'Venue team' }}</p><p class="mt-1">{{ entry.reason || entry.action }}</p></li><li v-if="history.length === 0" class="text-muted-foreground">No version history available.</li></ol><button type="button" class="mt-4 rounded-2xl bg-primary px-3 py-1.5 text-xs text-primary-foreground">Show full history</button></div>
  </section>
</template>
