<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeftIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import VenueForm from '@/components/venue/VenueForm.vue'
import { venuePayload, type VenueFormState } from '@/components/venue/venue-form-state'

definePageMeta({ permission: 'venues.manage' })
const { user } = useUserSession()
const { data: optionData, error: optionsError } = await useFetch('/api/venues/options')
const saving = ref(false)
const errors = ref<Record<string, string[]> | null>(null)
const { showError } = useErrorAlert()
watch(optionsError, value => { if (value) showError(value, 'Unable to load venue options') }, { immediate: true })
async function save(form: VenueFormState) { saving.value = true; errors.value = null; try { const venue = await $fetch<{ id: string }>('/api/venues', { method: 'POST', headers: { 'Idempotency-Key': globalThis.crypto?.randomUUID?.() ?? `${Date.now()}` }, body: venuePayload(form, user.value?.id ?? '') }); await navigateTo(`/venue/${venue.id}`) } catch (caught: any) { errors.value = caught?.data?.error?.fields ?? { form: ['Could not save this venue.'] }; showError(caught, 'Unable to create venue') } finally { saving.value = false } }
</script>

<template><VenueForm :options="optionData as never" :saving="saving" :errors="errors" submit-label="Create venue" @submit="save"><template #title><Button size="sm" variant="ghost" class="w-fit" as-child><NuxtLink to="/venue"><ArrowLeftIcon class="size-4" />Back</NuxtLink></Button><div><h1 class="text-3xl font-semibold">New venue</h1><p class="mt-1 text-sm text-muted-foreground">Add a venue and its operating details.</p></div></template></VenueForm></template>
