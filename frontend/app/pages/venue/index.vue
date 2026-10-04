<script setup lang="ts">
import { watch } from 'vue'
import VenueWorkspace from '@/components/venue/VenueWorkspace.vue'

definePageMeta({ permission: 'venues.view' })
const { data, error, refresh } = await useFetch('/api/venues', { key: 'venues' })
const { showError } = useErrorAlert()
watch(error, value => { if (value) showError(value, 'Unable to load venues') }, { immediate: true })
const venues = computed(() => ((data.value as { items?: unknown[] } | null)?.items ?? []))
</script>

<template>
  <VenueWorkspace v-if="!error" :venues="venues as never[]" @refresh="refresh" />
  <main v-else class="mx-auto max-w-[90rem] px-5 py-8 text-destructive">Venues are unavailable right now. Please try again later.</main>
</template>
