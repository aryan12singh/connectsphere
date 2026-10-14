<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MapPinIcon, PencilIcon, SearchIcon, UsersIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import VenueBookingRequests from './VenueBookingRequests.vue'
import VenueConflicts from './VenueConflicts.vue'
import VenueCalendar from './VenueCalendar.vue'
import VenueDetails from './VenueDetails.vue'

interface Venue { id: string, name: string, address?: string | null, capacity?: number | null, timeZone?: string, venueType?: string, isActive?: boolean, supportedLayouts?: string[], facilities?: string[], accessibilityTags?: string[], setupMinutes?:number, turnaroundMinutes?:number, operatingHours?: { weekday: string, isClosed: boolean, opensAt: string, closesAt: string }[] }
const props = defineProps<{ venues: Venue[] }>()
const emit = defineEmits<{ refresh: [] }>()
const { can } = usePermissions()
const { user } = useUserSession()
const ready = ref(false)
onMounted(() => { ready.value = true })
const activeTab = ref<'calendar' | 'requests' | 'conflicts'>('calendar')
const isVenueStaff = computed(() => (user.value?.roles ?? [user.value?.role]).includes('VENUE_STAFF') && can('venue_bookings.decide'))
const query = ref('')
const page = ref(1)
const selectedId = ref<string | null>(props.venues[0]?.id ?? null)
watch(() => props.venues, venues => { if (!venues.some(venue => venue.id === selectedId.value)) selectedId.value = venues[0]?.id ?? null }, { deep: true })
const matching = computed(() => props.venues.filter(venue => `${venue.name} ${venue.address ?? ''}`.toLowerCase().includes(query.value.toLowerCase())))
const pageSize = 6
const pageCount = computed(() => Math.max(1, Math.ceil(matching.value.length / pageSize)))
const visibleVenues = computed(() => matching.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(query, () => { page.value = 1 })
watch(pageCount, count => { page.value = Math.min(page.value, count) })
const selected = computed(() => props.venues.find(venue => venue.id === selectedId.value) ?? matching.value[0] ?? null)
const canManage = computed(() => can('venues.manage'))
const canCreateBooking = computed(() => isVenueStaff.value || (user.value?.roles ?? [user.value?.role]).includes('EVENT_COORDINATOR') && can('venue_bookings.create'))
const canDecideBooking = computed(() => isVenueStaff.value)
const canSetAllBookingStatuses = computed(() => isVenueStaff.value)
const deleting = ref(false)
const { showError } = useErrorAlert()
const pendingQuery = computed(() => ({
  venueId: selectedId.value ?? undefined,
  status: 'TENTATIVELY_HELD',
}))
const { data: pendingData, error: pendingError, refresh: refreshPending } = await useFetch('/api/bookings', {
  query: pendingQuery,
  immediate: isVenueStaff.value,
  watch: [pendingQuery, isVenueStaff],
})
watch(pendingError, value => { if (value) showError(value, 'Unable to load pending booking requests') }, { immediate: true })
const pendingRequestCount = computed(() => ((pendingData.value as { items?: unknown[] } | null)?.items ?? []).length)
function choose(venue: Venue) { selectedId.value = venue.id; activeTab.value = 'calendar' }
async function deleteVenue() {
  if (!selected.value || deleting.value) return
  deleting.value = true
  try {
    await $fetch<unknown>(`/api/venues/${selected.value.id}`, { method: 'DELETE' as never })
    selectedId.value = null
    emit('refresh')
  } catch (caught: any) {
    showError(caught, 'Unable to delete venue')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-0 w-full flex-col px-5 py-7 md:px-10 md:py-8 xl:h-[calc(100dvh-4rem)] xl:overflow-hidden">
    <h1 class="text-[32px] font-semibold leading-10 tracking-tight">Manage venues</h1>
    <div class="mt-5 flex gap-6 border-b border-border text-sm"><button :disabled="!ready" type="button" class="border-b-2 px-2 pb-2" :class="activeTab === 'calendar' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'" @click="activeTab = 'calendar'">Calendar</button><button :disabled="!ready" v-if="isVenueStaff" type="button" class="border-b-2 px-2 pb-2" :class="activeTab === 'requests' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'" @click="activeTab = 'requests'">Booking requests</button><button :disabled="!ready" v-if="isVenueStaff" type="button" class="border-b-2 px-2 pb-2" :class="activeTab === 'conflicts' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'" @click="activeTab = 'conflicts'">Buffer conflicts</button></div>
    <div v-if="activeTab === 'requests' && isVenueStaff" class="min-h-0 flex-1 overflow-y-auto pr-1">
      <VenueBookingRequests :can-decide="canDecideBooking" @updated="refreshPending" />
    </div>
    <div v-else-if="activeTab === 'conflicts' && isVenueStaff" class="min-h-0 flex-1 overflow-y-auto pr-1"><VenueConflicts /></div>
    <div v-else class="mt-5 grid min-h-0 min-w-0 gap-6 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)]"><aside class="min-w-0 overflow-x-hidden xl:min-h-0 xl:overflow-y-auto xl:pr-1"><label class="relative block"><SearchIcon class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><input :disabled="!ready" v-model="query" type="search" placeholder="Search venues..." class="h-8 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><div class="mt-3 grid min-w-0 gap-3"><button :disabled="!ready" v-for="venue in visibleVenues" :key="venue.id" type="button" class="box-border w-full min-w-0 max-w-full rounded-[18px] border p-4 text-left" :class="selected?.id === venue.id ? 'border-primary bg-secondary' : 'border-border bg-card'" @click="choose(venue)"><span class="flex min-w-0 items-start justify-between gap-2"><span class="truncate text-sm font-medium">{{ venue.name }}</span><span class="shrink-0 rounded-xl px-2 py-0.5 text-[11px]" :class="venue.isActive === false ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'">{{ venue.isActive === false ? 'Inactive' : 'Active' }}</span></span><span class="mt-2 flex min-w-0 items-center gap-2 text-xs"><MapPinIcon class="size-3.5 shrink-0 text-primary" /><span class="truncate">{{ venue.address || 'Virtual venue' }}</span></span><span class="mt-1 flex min-w-0 items-center gap-2 text-xs"><UsersIcon class="size-3.5 shrink-0 text-primary" />Max. {{ venue.capacity ?? '—' }} attendees</span></button></div><Button v-if="canManage" as-child size="sm" class="mx-auto mt-3"><NuxtLink to="/venue/new">Add new venue</NuxtLink></Button><p v-if="matching.length === 0" role="status" class="mt-4 text-sm text-muted-foreground">{{ venues.length ? 'No venues match your search.' : 'No venues available.' }}</p><nav v-if="matching.length > 0" class="mt-4 flex items-center justify-center gap-4 text-xs" aria-label="Venue pages"><button type="button" :disabled="!ready || page === 1" @click="page = Math.max(1, page - 1)">‹ Previous</button><span aria-live="polite">Page {{ page }} of {{ pageCount }}</span><button type="button" :disabled="!ready || page === pageCount" @click="page = Math.min(pageCount, page + 1)">Next ›</button></nav></aside>
      <section v-if="selected" class="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pr-1"><VenueCalendar :venue-id="selected.id" :venue-name="selected.name" :time-zone="selected.timeZone ?? 'Asia/Singapore'" :operating-hours="selected.operatingHours" :setup-minutes="selected.setupMinutes" :turnaround-minutes="selected.turnaroundMinutes" :can-create="canCreateBooking" :can-decide="canDecideBooking" :can-set-all-statuses="canSetAllBookingStatuses" :actor-id="user?.id" :actor-role="user?.role" :actor-roles="user?.roles" :show-pending-requests="isVenueStaff" :pending-request-count="pendingRequestCount" @open-requests="activeTab = 'requests'"><template #heading><div class="flex flex-wrap items-center gap-2"><h2 class="text-xl font-medium">{{ selected.name }}</h2><Button v-if="canManage" size="sm" as-child><NuxtLink :to="`/venue/${selected.id}`"><PencilIcon class="size-3.5" />Edit venue</NuxtLink></Button><Button v-if="canManage" size="sm" variant="destructive" :disabled="!ready || deleting" @click="deleteVenue">{{ deleting ? 'Deleting…' : 'Delete venue' }}</Button></div></template></VenueCalendar><VenueDetails :venue="selected" /></section>
    </div>
  </main>
</template>
