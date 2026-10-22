<script setup lang="ts">
import { computed,nextTick, onMounted,onUnmounted, ref, watch } from 'vue'
import { CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon, MapPinIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmationDialog from './ConfirmationDialog.vue'
import { bookingDraftForCalendarSlot, bookingDraftForExisting, bookingDraftForSlot, bookingDraftState, bookingMutation, bookingPopoverOffset, bookingSelectionStatuses, calendarIsoToWallTime, calendarSelectionFromDrag, calendarWallTimeToIso, coordinatorBookingEditState, venueStaffCreationState, type BookingDraft } from './booking-state'
import { advanceCalendarDate, bufferSegmentsForRange, calendarDaysForRange, calendarRange, calendarSlotState, fullDayCalendarHours, intervalSegmentsForRange, type CalendarBooking, type CalendarMode, type CalendarOperatingHour } from './calendar-state'

const props = defineProps<{ venueId: string, venueName: string, timeZone: string, operatingHours?: CalendarOperatingHour[], setupMinutes?:number, turnaroundMinutes?:number, canCreate: boolean, canDecide: boolean, canSetAllStatuses?: boolean, actorId?: string | null, actorRole?: string | null, actorRoles?:string[], showPendingRequests?: boolean, pendingRequestCount?: number }>()
const emit = defineEmits<{ openRequests: [] }>()
const ready = ref(false)
const clockNow=ref(Date.now());let expiryTimer:ReturnType<typeof setInterval>|undefined
onMounted(() => { ready.value = true;expiryTimer=setInterval(()=>{clockNow.value=Date.now()},1000) })
onUnmounted(()=>clearInterval(expiryTimer))
const mode = ref<CalendarMode>('week')
const activeDate = ref(new Date(`${calendarIsoToWallTime(new Date().toISOString(), props.timeZone || 'Asia/Singapore').slice(0, 10)}T00:00:00Z`))
const range = computed(() => calendarRange(mode.value, activeDate.value, props.timeZone || 'Asia/Singapore'))
const { data, error, refresh } = await useFetch('/api/bookings/availability', { query: computed(() => ({ venueId: props.venueId, startAt: range.value.startAt, endAt: range.value.endAt })), watch: [range, () => props.venueId] })
const { showError } = useErrorAlert()
watch(error, value => { if (value) showError(value, 'Unable to load availability') }, { immediate: true })
const { data: eventData, error: eventError } = await useFetch('/api/events', { query: { scope: 'booking' }, immediate: props.canCreate, watch: false })
watch(eventError, value => { if (value) showError(value, 'Unable to load your events') }, { immediate: true })
interface BookingEventOption { id: string, title: string, status: string }
const bookingEvents = computed(() => ((eventData.value as { events?: BookingEventOption[] } | null)?.events ?? []).filter(event => event && typeof event.id === 'string' && typeof event.title === 'string'))
const isVenueStaff = computed(() => (props.actorRoles ?? [props.actorRole]).includes('VENUE_STAFF') && props.canDecide)
const isCoordinator = computed(() => !isVenueStaff.value && (props.actorRoles ?? [props.actorRole]).includes('EVENT_COORDINATOR') && props.canCreate)
const bookings = computed(() => ((data.value as { items?: CalendarBooking[] } | null)?.items ?? []).filter(booking=>booking.status!=='TENTATIVELY_HELD' || !booking.expiresAt || Date.parse(booking.expiresAt)>clockNow.value))
const segments = computed(() => intervalSegmentsForRange(bookings.value, range.value, props.timeZone || 'Asia/Singapore'))
const bufferSegments = computed(() => bufferSegmentsForRange(bookings.value,range.value,props.timeZone || 'Asia/Singapore'))
function buffersForDay(day:Date){return bufferSegments.value.filter(segment=>segment.day===day.toISOString().slice(0,10))}
function bookingTooltip(booking:CalendarBooking){const time=(value:string)=>calendarIsoToWallTime(value,props.timeZone || 'Asia/Singapore').replace('T',' ');return `Advertised: ${time(booking.startAt)}–${time(booking.endAt)}. Occupied: ${time(booking.occupiedStart || booking.startAt)}–${time(booking.occupiedEnd || booking.endAt)}${booking.expiresAt?`. Hold expires: ${time(booking.expiresAt)}`:''}`}
const days = computed(() => calendarDaysForRange(range.value, props.timeZone || 'Asia/Singapore'))
const hours = fullDayCalendarHours()
const gridHeight = hours.length * 42
const firstHour = hours[0] ?? 0
const draft = ref<BookingDraft | null>(null)
const editingBookingId = ref<string | null>(null)
const dragStart = ref<{ day: Date, hour: number } | null>(null)
const dragEnd = ref<{ day: Date, hour: number } | null>(null)
const posting = ref(false),impact=ref<any>(null),impactBody=ref<any>(null)
const unconfirmedSave=ref<{body:any;impact:any;mutation:ReturnType<typeof bookingMutation>;key:string}|null>(null),impactError=ref('')
const mutationKeys=new Map<string,string>()
const bookingForm=ref<HTMLFormElement|null>(null)
const impactTrigger=ref<HTMLElement|null>(null)

function dateAt(day: Date, hour: number) { const value = new Date(day); value.setUTCHours(hour, 0, 0, 0); return value }
function localInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
function toIso(value: string, timeZone = props.timeZone || 'Asia/Singapore') { return calendarWallTimeToIso(value, timeZone) }
function draftFor(start: Date, end: Date) { return bookingDraftForSlot(props.venueId, props.timeZone || 'Asia/Singapore', localInput(start), localInput(end)) }
function newCalendarDraft(day: string, hour: number, durationMinutes: number) {
  const value = bookingDraftForCalendarSlot(props.venueId, props.timeZone || 'Asia/Singapore', day, hour, durationMinutes)
  if (isVenueStaff.value){value.status = venueStaffCreationState(false).initialStatus;value.unavailabilityCategory='MAINTENANCE';value.unavailabilityNote=''}
  return value
}
function slotState(day: Date, hour: number) { return calendarSlotState(day.toISOString().slice(0, 10), hour, props.operatingHours ?? []) }
function startSelection(day: Date, hour: number) { if (!ready.value || !props.canCreate || slotState(day, hour) === 'unavailable') return; editingBookingId.value = null; dragStart.value = { day, hour }; dragEnd.value = { day, hour: hour + 1 }; draft.value = null }
async function activateSlot(day:Date,hour:number){startSelection(day,hour);finishSelection();await nextTick();bookingForm.value?.querySelector('input')?.focus()}
function extendSelection(day: Date, hour: number) { if (!dragStart.value || slotState(day, hour) === 'unavailable') return; dragEnd.value = { day, hour: hour + 1 } }
function finishSelection() {
  if (!dragStart.value || !dragEnd.value) return
  const selection = calendarSelectionFromDrag(dateAt(dragStart.value.day, dragStart.value.hour).toISOString(), dateAt(dragEnd.value.day, dragEnd.value.hour).toISOString())
  const start = new Date(selection.startAt)
  if (selection.durationMinutes > 0) draft.value = newCalendarDraft(start.toISOString().slice(0, 10), start.getUTCHours(), selection.durationMinutes)
}
function cancelSelection() { dragStart.value = null; dragEnd.value = null; draft.value = null; editingBookingId.value = null }
const selection = computed(() => {
  if (!dragStart.value || !dragEnd.value) return null
  const first = dateAt(dragStart.value.day, dragStart.value.hour); const second = dateAt(dragEnd.value.day, dragEnd.value.hour)
  const range = calendarSelectionFromDrag(first.toISOString(), second.toISOString())
  const day = new Date(range.startAt).toISOString().slice(0, 10)
  return { day, column: days.value.findIndex(value => value.toISOString().slice(0, 10) === day), top: (new Date(range.startAt).getUTCHours() - firstHour) * 42, height: Math.max(42, range.durationMinutes / 60 * 42), bottom: (new Date(range.startAt).getUTCHours() - firstHour) * 42 + Math.max(42, range.durationMinutes / 60 * 42) }
})
function openNewBooking() {
  if (!ready.value || !props.canCreate) return
  const day = new Date(activeDate.value)
  day.setUTCHours(9, 0, 0, 0)
  const date = day.toISOString().slice(0, 10)
  editingBookingId.value = null
  dragStart.value = { day, hour: 9 }
  dragEnd.value = { day, hour: 10 }
  draft.value = newCalendarDraft(date, 9, 60)
}
function openExistingBooking(booking: CalendarBooking) {
  if (!ready.value || !props.canCreate) return
  const timeZone = (booking.timeZone ?? props.timeZone) || 'Asia/Singapore'
  const startWall = calendarIsoToWallTime(booking.startAt, timeZone)
  const endWall = calendarIsoToWallTime(booking.endAt, timeZone)
  const startDay = new Date(`${startWall.slice(0, 10)}T00:00:00Z`)
  const endDay = new Date(`${endWall.slice(0, 10)}T00:00:00Z`)
  editingBookingId.value = booking.id
  dragStart.value = { day: startDay, hour: Number(startWall.slice(11, 13)) }
  dragEnd.value = { day: endDay, hour: Number(endWall.slice(11, 13)) || (endWall.slice(0, 10) === startWall.slice(0, 10) ? Number(startWall.slice(11, 13)) + 1 : 0) }
  draft.value = bookingDraftForExisting(booking)
}
function navigate(direction: -1 | 1) { activeDate.value = advanceCalendarDate(mode.value, activeDate.value, direction); cancelSelection() }
function segmentsForDay(day: Date) { return segments.value.filter(segment => segment.day === day.toISOString().slice(0, 10)) }
function eventStyle(segment: { startAt: string, endAt: string }) { const startWall = calendarIsoToWallTime(segment.startAt, props.timeZone || 'Asia/Singapore'); const startHour = Number(startWall.slice(11, 13)); const startMinute = Number(startWall.slice(14, 16)); const endWall = calendarIsoToWallTime(segment.endAt, props.timeZone || 'Asia/Singapore'); const endMinutes = endWall.slice(0, 10) !== startWall.slice(0, 10) ? 24 * 60 : Number(endWall.slice(11, 13)) * 60 + Number(endWall.slice(14, 16)); return { top: `${(startHour - firstHour) * 42 + startMinute / 60 * 42}px`, height: `${Math.max(34, (endMinutes - startHour * 60 - startMinute) / 60 * 42)}px` } }
function eventClass(status: string) { return { BLOCKED: 'border-l-2 border-l-foreground bg-muted text-foreground', UNAVAILABLE: 'bg-muted-foreground text-background', TENTATIVELY_HELD: 'border border-dashed border-muted-foreground bg-background text-foreground', CONFLICT: 'border border-destructive bg-transparent text-foreground', CONFIRMED: 'border-l-2 border-l-primary bg-primary/10 text-foreground', REJECTED: 'border border-red-500 bg-red-500/15 text-foreground', CANCELLED: 'border border-slate-500 bg-slate-500/15 text-foreground line-through' }[status] ?? 'border-l-2 border-l-primary bg-primary/10 text-foreground' }
const state = computed(() => {
  if (!draft.value) return null
  try {
    return bookingDraftState({ ...draft.value, startAt: toIso(draft.value.startAt, draft.value.timeZone), endAt: toIso(draft.value.endAt, draft.value.timeZone) }, bookings.value, editingBookingId.value, isCoordinator.value, {setupMinutes:props.setupMinutes ?? 0,turnaroundMinutes:props.turnaroundMinutes ?? 0,allowTouching:(data.value as {policy?:{allowTouching?:boolean}} | null)?.policy?.allowTouching ?? true})
  }
  catch {
    return { status: draft.value.status, errors: { endAt: 'Enter valid, unambiguous local start and end times.' }, overlaps: [], canSubmit: false }
  }
})
const currentBooking = computed(() => editingBookingId.value ? bookings.value.find(booking => booking.id === editingBookingId.value) ?? null : null)
const coordinatorEditState = computed(() => coordinatorBookingEditState(currentBooking.value, props.actorId))
const coordinatorReadOnly = computed(() => isCoordinator.value && coordinatorEditState.value.readOnly || isVenueStaff.value && Boolean(editingBookingId.value) && !['BLOCKED','UNAVAILABLE'].includes(currentBooking.value?.status ?? ''))
const statusDisabled = computed(() => coordinatorReadOnly.value || isCoordinator.value && !coordinatorEditState.value.canEdit)
const statuses = computed(() => {
  if (isCoordinator.value) return coordinatorEditState.value.statuses
  if (isVenueStaff.value) return !editingBookingId.value ? venueStaffCreationState(false).statuses : ['BLOCKED','UNAVAILABLE'].includes(currentBooking.value?.status ?? '') ? ['BLOCKED','UNAVAILABLE','CANCELLED'] : [currentBooking.value?.status ?? draft.value?.status ?? 'CONFIRMED']
  return bookingSelectionStatuses(props.canDecide, props.canSetAllStatuses)
})
function mutationKey(body:any){
 const signature=JSON.stringify(body)
 if(!mutationKeys.has(signature))mutationKeys.set(signature,crypto.randomUUID())
 return mutationKeys.get(signature)!
}
async function persist(body:any){
 const mutation=unconfirmedSave.value?.mutation||bookingMutation(editingBookingId.value)
 await $fetch(mutation.path,{method:mutation.method,headers:{'Idempotency-Key':unconfirmedSave.value?.key||mutationKey(body)},body} as any)
 unconfirmedSave.value=null;impactError.value='';impact.value=null;impactBody.value=null;cancelSelection();await refresh()
}
function resumeUnconfirmed(){if(!unconfirmedSave.value||posting.value)return;impact.value=unconfirmedSave.value.impact;impactBody.value=unconfirmedSave.value.body;impactError.value='The earlier save is awaiting acknowledgement. Retry the same confirmed window before starting another change.'}
async function save(){
 if(posting.value)return
 if(unconfirmedSave.value){resumeUnconfirmed();return}
 if(!draft.value||!state.value?.canSubmit)return
 impactTrigger.value=document.activeElement instanceof HTMLElement?document.activeElement:null
 posting.value=true
 try{
  const body={...draft.value,startAt:toIso(draft.value.startAt,draft.value.timeZone),endAt:toIso(draft.value.endAt,draft.value.timeZone)}
  if(isVenueStaff.value&&['BLOCKED','UNAVAILABLE'].includes(body.status)){
   impact.value=await $fetch('/api/bookings/impact-preview',{method:'POST',body:{...body,bookingId:editingBookingId.value}})
   impactBody.value=body;impactError.value=''
  }else await persist(body)
 }catch(caught){showError(caught,'Unable to save booking')}
 finally{posting.value=false}
}
async function confirmUnavailable(){
 if(!impact.value||!impactBody.value||posting.value)return
 posting.value=true
 const body=unconfirmedSave.value?.body||{...impactBody.value,confirmImpact:true,impactFingerprint:impact.value.impactFingerprint}
 if(!unconfirmedSave.value)unconfirmedSave.value={body:JSON.parse(JSON.stringify(body)),impact:JSON.parse(JSON.stringify(impact.value)),mutation:bookingMutation(editingBookingId.value),key:mutationKey(body)}
 try{await persist(body)}
 catch(caught){
  showError(caught,'Unable to save unavailable window')
  const status=(caught as any)?.statusCode||(caught as any)?.status||(caught as any)?.response?.status
  if(status>=400&&status<500&&status!==408){unconfirmedSave.value=null;impact.value=null;impactError.value='';await refresh()}
  else impactError.value='The save may have completed. Retry this same confirmed window to receive its result without creating another window.'
 }
 finally{posting.value=false}
}
</script>

<template>
  <section class="min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-3"><div class="min-w-0"><slot name="heading"><h2 class="text-xl font-medium">{{ venueName }}</h2></slot></div><div class="flex items-center gap-2"><select v-model="mode" :disabled="!ready" aria-label="Calendar view" class="h-8 rounded-2xl border border-border bg-background px-3 text-xs"><option value="week">7 days</option><option value="day">Day</option></select><Button v-if="canCreate" size="sm" :disabled="!ready" @click="openNewBooking">{{ isVenueStaff ? 'New unavailable window' : 'New booking' }}</Button></div></div>
    <button :disabled="!ready" v-if="props.showPendingRequests && (props.pendingRequestCount ?? 0) > 0" type="button" class="mt-4 flex w-full items-center justify-between rounded-[18px] bg-muted px-3 py-2 text-left text-sm hover:bg-muted/80" @click="emit('openRequests')"><span><span aria-hidden="true">✿</span> This venue has {{ props.pendingRequestCount }} pending booking request{{ props.pendingRequestCount === 1 ? '' : 's' }}.</span><span aria-hidden="true">›</span></button>
    <Card class="relative mt-4 overflow-visible rounded-[14px] border-border p-0"><div class="flex h-10 items-center justify-between border-b border-border px-3"><span class="flex items-center gap-2 text-sm"><CalendarClockIcon class="size-4 text-primary" />Schedule</span><span class="flex items-center gap-3 text-xs"><Button size="icon" variant="ghost" class="size-6" aria-label="Previous range" :disabled="!ready" @click="navigate(-1)"><ChevronLeftIcon class="size-3.5" /></Button>{{ days[0]?.toISOString().slice(5, 10) }} – {{ days[days.length - 1]?.toISOString().slice(5, 10) }}<Button size="icon" variant="ghost" class="size-6" aria-label="Next range" :disabled="!ready" @click="navigate(1)"><ChevronRightIcon class="size-3.5" /></Button></span></div>
      <div class="overflow-x-auto" tabindex="0" aria-label="Scrollable availability calendar"><div class="min-w-[1120px]"><div class="grid" :style="{ gridTemplateColumns: `56px repeat(${days.length}, minmax(150px, 1fr))` }"><div class="border-r border-border" /><div v-for="day in days" :key="day.toISOString()" class="border-b border-r border-border py-2 text-center text-xs font-medium">{{ day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }) }}</div><template v-for="hour in hours" :key="hour"><div class="h-[42px] border-b border-r border-border pr-2 pt-1 text-right text-[11px] text-muted-foreground">{{ hour % 12 || 12 }} {{ hour >= 12 ? 'PM' : 'AM' }}</div><button v-for="day in days" :key="`${day.toISOString()}-${hour}`" type="button" class="h-[42px] border-b border-r" :class="slotState(day, hour) === 'unavailable' ? 'cursor-not-allowed bg-muted/70 text-muted-foreground' : 'border-border hover:bg-primary/5'" :aria-label="slotState(day, hour) === 'unavailable' ? `Unavailable ${day.toDateString()} at ${hour}:00` : `Select ${day.toDateString()} at ${hour}:00`" :disabled="!ready || slotState(day, hour) === 'unavailable'" :aria-disabled="!ready || slotState(day, hour) === 'unavailable'" @keydown.enter.prevent="activateSlot(day,hour)" @keydown.space.prevent="activateSlot(day,hour)" @click="$event.detail===0 && activateSlot(day,hour)" @mousedown.prevent="startSelection(day, hour)" @mouseenter="extendSelection(day, hour)" @mouseup="finishSelection" /></template></div><div class="pointer-events-none relative ml-14 grid" :style="{ marginTop: `-${gridHeight}px`, height: `${gridHeight}px`, gridTemplateColumns: `repeat(${days.length}, minmax(150px, 1fr))` }"><div v-for="day in days" :key="`events-${day.toISOString()}`" class="relative"><div v-for="buffer in buffersForDay(day)" :key="`${buffer.booking.id}-${buffer.kind}-${buffer.day}`" :data-buffer="buffer.kind" class="absolute inset-x-1 overflow-hidden rounded border border-dashed border-primary/40 bg-primary/5 px-1.5 text-[10px] text-muted-foreground" :style="{ ...eventStyle(buffer), minHeight: '2px', height: `${Math.max(2, (Date.parse(buffer.endAt) - Date.parse(buffer.startAt)) / 60000 / 60 * 42)}px` }" :title="bookingTooltip(buffer.booking)">{{ buffer.kind === 'setup' ? 'Setup' : 'Turnaround' }}</div><button :disabled="!ready" v-for="segment in segmentsForDay(day)" :key="`${segment.booking.id}-${segment.day}`" type="button" class="pointer-events-auto absolute inset-x-1 overflow-hidden rounded px-1.5 py-1 text-left text-[11px]" :class="eventClass(segment.booking.flags?.length ? 'CONFLICT' : segment.booking.status)" :title="bookingTooltip(segment.booking)" :style="eventStyle(segment)" @click.stop="openExistingBooking(segment.booking)"><span class="block truncate font-medium">{{ segment.booking.title }}</span><span v-if="segment.booking.flags?.includes('AFFECTED_UNAVAILABLE')" class="block font-semibold">Affected — alternative required</span><span class="block truncate text-[10px] opacity-80">{{ segment.booking.requestedById || segment.booking.reason }}</span></button><div v-if="selection?.day === day.toISOString().slice(0, 10)" class="pointer-events-none absolute inset-x-1 rounded border-2 border-primary bg-primary/10" :style="{ top: `${selection.top}px`, height: `${selection.height}px` }" /></div></div></div></div>
      <Card v-if="draft && selection" class="absolute z-20 w-64 p-3 shadow-lg" :style="{ top: `${40 + bookingPopoverOffset(selection.bottom)}px`, left: `min(calc(100% - 264px), max(8px, calc(56px + ${selection.column} * (100% - 56px) / ${days.length})))` }"><form ref="bookingForm" class="grid gap-2" @submit.prevent="save"><div class="flex items-center justify-between"><span class="text-sm font-medium">{{ editingBookingId ? 'Edit booking' : isVenueStaff ? 'New unavailable window' : 'New booking' }}</span><button type="button" aria-label="Close booking form" @click="cancelSelection"><XIcon class="size-4" /></button></div><p class="flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon class="size-3 text-primary" />{{ draft.startAt.slice(0, 10) }} · {{ draft.startAt.slice(11) }}–{{ draft.endAt.slice(11) }}</p><label class="grid gap-1 text-xs">Start date and time<input v-model="draft.startAt" type="datetime-local" required :disabled="coordinatorReadOnly" class="h-8 rounded-xl border border-border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label><label class="grid gap-1 text-xs">End date and time<input v-model="draft.endAt" type="datetime-local" required :disabled="coordinatorReadOnly" class="h-8 rounded-xl border border-border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label><label v-if="isCoordinator || (isVenueStaff && editingBookingId)" class="grid gap-1 text-xs">Event<select v-model="draft.eventId" :required="isCoordinator" :disabled="coordinatorReadOnly" :class="draft.eventId ? 'text-foreground' : 'text-muted-foreground'" class="h-8 rounded-2xl border border-border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"><option value="" class="bg-background text-muted-foreground">Select your event</option><option v-for="event in bookingEvents" :key="event.id" :value="event.id" class="bg-background text-foreground">{{ event.title }}</option></select></label><label class="grid gap-1 text-xs">Title<input v-model="draft.title" required :disabled="coordinatorReadOnly" placeholder="Add event title..." class="h-8 rounded-2xl border border-border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label><label class="grid gap-1 text-xs">Venue status<select v-model="draft.status" :disabled="statusDisabled || coordinatorReadOnly" class="h-8 rounded-2xl border border-border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"><option v-for="status in statuses" :key="status" :value="status">{{ status.replaceAll('_', ' ') }}</option></select></label><template v-if="isVenueStaff && ['BLOCKED','UNAVAILABLE'].includes(draft.status)"><label class="grid gap-1 text-xs">Reason category<select v-model="draft.unavailabilityCategory" class="h-8 rounded-xl border px-2"><option value="MAINTENANCE">Maintenance</option><option value="EQUIPMENT_FAILURE">Equipment failure</option><option value="RENOVATION">Renovation</option><option value="SAFETY_CONCERN">Safety concern</option><option value="OTHER">Other</option></select></label><label class="grid gap-1 text-xs">Internal operational note<textarea v-model="draft.unavailabilityNote" maxlength="1000" class="rounded-xl border px-2" /></label></template><label class="grid gap-1 text-xs">Reason<textarea v-model="draft.reason" required :disabled="coordinatorReadOnly" rows="2" placeholder="Textarea" class="rounded-xl border border-border px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label><p v-if="state?.errors.eventId || state?.errors.endAt || state?.errors.interval" role="alert" class="text-xs text-destructive">{{ state.errors.eventId ?? state.errors.endAt ?? state.errors.interval }}</p><p v-if="state?.overlaps.length" class="text-xs text-warning">Overlaps: {{ state.overlaps.join(', ') }}{{ draft.status === 'BLOCKED' ? '. You may continue.' : '' }}</p><div class="flex justify-between"><Button type="button" variant="ghost" size="sm" @click="cancelSelection">Cancel</Button><Button type="submit" size="sm" :disabled="!state?.canSubmit || posting || coordinatorReadOnly">{{ editingBookingId ? 'Save changes' : 'Save booking' }}</Button></div></form></Card>
    </Card>
    <p v-if="unconfirmedSave" role="status" class="mt-3 text-sm">An earlier unavailable-window save is awaiting acknowledgement. <Button size="sm" variant="outline" :disabled="posting" @click="resumeUnconfirmed">Retry previous save</Button></p>
    <ConfirmationDialog v-if="impact" label="Confirm affected bookings" :busy="posting" :return-focus="impactTrigger" @dismiss="impact=null"><h3 class="font-semibold">Review unavailable window</h3><p v-if="impactBody">{{ calendarIsoToWallTime(impactBody.startAt,props.timeZone) }} – {{ calendarIsoToWallTime(impactBody.endAt,props.timeZone) }} ({{ props.timeZone }})</p><p v-if="impactError" role="alert">{{ impactError }}</p><p>All overlapping holds and bookings, including setup and turnaround:</p><p v-if="!impact.affected.length">No current bookings or holds overlap.</p><div v-for="booking in impact.affected" :key="booking.id" class="affected-event rounded border p-3"><p>{{ booking.title }} · Event {{ booking.eventId }} · {{ booking.status }}</p><p>Occupied {{ calendarIsoToWallTime(booking.occupiedStart,props.timeZone || 'Asia/Singapore') }} – {{ calendarIsoToWallTime(booking.occupiedEnd,props.timeZone || 'Asia/Singapore') }}</p></div><p>These arrangements will be retained and marked Affected — alternative required. Their Coordinator and Organiser will be informed.</p><div class="flex gap-2"><Button autofocus variant="outline" :disabled="posting" @click="impact=null">Back</Button><Button :disabled="posting" @click="confirmUnavailable">Confirm unavailable window</Button></div></ConfirmationDialog>
    <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground"><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border border-border bg-background" aria-hidden="true" />Available</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border-l-2 border-primary bg-primary/10" aria-hidden="true" />Confirmed</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border-l-2 border-foreground bg-muted" aria-hidden="true" />Blocked</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border border-dashed border-muted-foreground bg-background" aria-hidden="true" />Tentatively held</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] bg-muted-foreground" aria-hidden="true" />Unavailable</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border border-destructive bg-transparent" aria-hidden="true" />Conflict</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border border-red-500 bg-red-500/15" aria-hidden="true" />Rejected</span><span class="inline-flex items-center gap-1.5"><i class="inline-block h-3.5 w-[18px] rounded-[3px] border border-slate-500 bg-slate-500/15" aria-hidden="true" />Cancelled</span></div>
  </section>
</template>
