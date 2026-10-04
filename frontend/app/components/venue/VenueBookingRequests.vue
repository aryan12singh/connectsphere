<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SearchIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CalendarBooking } from './calendar-state'

interface RequestBooking extends CalendarBooking { createdAt?: string, statusChangedById?: string | null }
const props = defineProps<{ canDecide: boolean }>()
const emit = defineEmits<{ updated: [] }>()
const { data, error, refresh } = await useFetch('/api/bookings', { query: { status: 'TENTATIVELY_HELD' } })
const { showError } = useErrorAlert()
watch(error, value => { if (value) showError(value, 'Unable to load booking requests') }, { immediate: true })
const search = ref('')
const deciding = ref<string | null>(null)
const message = ref('')
const items = computed(() => ((data.value as { items?: RequestBooking[] } | null)?.items ?? []).filter(item => `${item.title} ${item.venueId} ${item.requestedById}`.toLowerCase().includes(search.value.toLowerCase())))
function timeAgo(value?: string) { if (!value) return 'Recently'; const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 60 ? `${minutes} minutes ago` : `${Math.round(minutes / 60)} hours ago` }
async function decide(booking: RequestBooking, status: 'CONFIRMED' | 'REJECTED') { if (!props.canDecide || deciding.value) return; deciding.value = booking.id; message.value = ''; try { await $fetch(`/api/bookings/${booking.id}`, { method: 'PUT', body: { ...booking, status, reason: booking.reason ?? '' } } as any); await refresh(); emit('updated') } catch (caught) { showError(caught, 'Unable to update booking request') } finally { deciding.value = null } }
</script>

<template>
  <section class="mt-7"><h2 class="text-xl font-semibold">Pending booking requests</h2><label class="relative mt-4 block"><SearchIcon class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><input v-model="search" type="search" placeholder="Search requests, organisers, or venues..." class="h-8 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><p v-if="!error && items.length === 0" class="mt-4 text-sm text-muted-foreground">No booking requests awaiting review.</p><div v-else-if="!error" class="mt-4 grid gap-3"><Card v-for="booking in items" :key="booking.id" class="rounded-[18px] p-7"><h3 class="text-xl font-medium">{{ booking.title }} @{{ booking.venueId }}</h3><dl class="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><dt class="text-xs text-muted-foreground">Organiser</dt><dd class="mt-1">{{ booking.requestedById || '—' }}</dd></div><div><dt class="text-xs text-muted-foreground">Assigned coordinator</dt><dd class="mt-1">{{ booking.statusChangedById || 'Unassigned' }}</dd></div><div><dt class="text-xs text-muted-foreground">Submitted by coordinator</dt><dd class="mt-1">{{ timeAgo(booking.createdAt) }}</dd></div><div class="sm:col-span-3"><dt class="text-xs text-muted-foreground">Reason</dt><dd class="mt-1">{{ booking.reason || '—' }}</dd></div></dl><div class="mt-4 flex flex-wrap gap-2"><Button size="sm" :disabled="!canDecide || deciding === booking.id" @click="decide(booking, 'CONFIRMED')">Approve</Button><Button size="sm" variant="secondary" :disabled="!canDecide || deciding === booking.id" @click="message = 'Amendment requests are not available yet.'">Ask for amendments</Button><Button size="sm" variant="destructive" :disabled="!canDecide || deciding === booking.id" @click="decide(booking, 'REJECTED')">Reject</Button></div></Card></div><p v-if="message" role="alert" class="mt-3 text-sm text-destructive">{{ message }}</p>
  </section>
</template>
