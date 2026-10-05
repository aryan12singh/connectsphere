<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeftIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import VenueForm from '@/components/venue/VenueForm.vue'
import { venuePayload, type VenueFormState } from '@/components/venue/venue-form-state'

definePageMeta({ permission: 'venues.manage' })
const route = useRoute()
const { user } = useUserSession()
const id = computed(() => String(route.params.id))
const { data: venue, error: loadError } = await useFetch(() => `/api/venues/${id.value}`, { watch: [id] })
const { data: optionData, error: optionsError } = await useFetch('/api/venues/options')
const saving = ref(false)
const errors = ref<Record<string, string[]> | null>(null)
const { showError } = useErrorAlert()
watch(loadError, value => { if (value) showError(value, 'Unable to load venue') }, { immediate: true })
watch(optionsError, value => { if (value) showError(value, 'Unable to load venue options') }, { immediate: true })
async function save(form: VenueFormState) { saving.value = true; errors.value = null; try { await $fetch(`/api/venues/${id.value}`, { method: 'PUT', body: venuePayload(form, user.value?.id ?? '') } as any); await navigateTo('/venue') } catch (caught: any) { errors.value = caught?.data?.error?.fields ?? { form: ['Could not save this venue.'] }; showError(caught, 'Unable to save venue') } finally { saving.value = false } }
</script>

<template><VenueForm v-if="!loadError && venue" :venue="venue as never" :options="optionData as never" :saving="saving" :errors="errors" @submit="save"><template #title><Button size="sm" variant="ghost" class="w-fit" as-child><NuxtLink to="/venue"><ArrowLeftIcon class="size-4" />Back</NuxtLink></Button><div><h1 class="text-3xl font-semibold">Edit venue</h1><p class="mt-1 text-sm text-muted-foreground">Update venue details safely.</p></div></template></VenueForm><main v-else class="mx-auto max-w-[90rem] px-5 py-8 text-destructive">Venue not found or unavailable.</main></template>
