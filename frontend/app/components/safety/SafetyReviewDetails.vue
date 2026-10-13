<script setup lang="ts">
import type { SafetySnapshot, SafetyVenue } from './safety-review-state'
const props=defineProps<{snapshot:SafetySnapshot}>()
const text=(value:string | null | undefined)=>value?.trim() || 'Not recorded'
function attendance(room:SafetyVenue) {
  if(room.venueType==='VIRTUAL')return `${room.expectedAttendance ?? 'Not recorded'} attendees · Physical capacity not applicable`
  return `${room.expectedAttendance ?? 'Not recorded'} / ${room.capacity ?? 'Not recorded'}`
}
function exceeds(room:SafetyVenue) {
  return room.venueType!=='VIRTUAL' && typeof room.expectedAttendance==='number'
    && typeof room.capacity==='number' && room.expectedAttendance>room.capacity
}
function factors(room:SafetyVenue) {
  return [
    ['Attendance and capacity',attendance(room)],
    ['Layout',text(room.layout)],
    ['Emergency access',text(room.emergencyAccess)],
    ['Accessibility requirements',room.accessibilityNeeds?.length?room.accessibilityNeeds.join(', '):'None recorded'],
    ['Equipment placement',text(room.equipmentPlacement)],
    ['Crowd movement',text(room.crowdMovement)],
    ['Venue restrictions',text(room.restrictions)],
  ]
}
</script>
<template>
  <section aria-label="Safety review factors" class="grid gap-4">
    <p v-if="!props.snapshot.venues.length" class="text-sm text-muted-foreground">No venue arrangements are available for review.</p>
    <article v-for="room in props.snapshot.venues" :key="room.bookingId" :data-safety-booking="room.bookingId" class="rounded-2xl border border-border p-4">
      <h3 class="font-semibold">{{ room.venueName }}</h3>
      <p v-if="exceeds(room)" role="alert" class="mt-2 text-sm font-medium text-destructive">Attendance exceeds capacity. This room needs attention.</p>
      <dl class="mt-3 grid gap-3 sm:grid-cols-2">
        <div v-for="[label,value] in factors(room)" :key="label"><dt class="text-sm font-medium">{{ label }}</dt><dd class="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{{ value }}</dd></div>
      </dl>
    </article>
    <div class="text-sm">
      <h3 class="font-medium">Equipment list</h3>
      <p v-if="props.snapshot.equipmentStatus === 'UNVERIFIED'" class="mt-1 text-muted-foreground">Equipment approval has not been verified.</p>
      <p v-else-if="props.snapshot.equipmentStatus === 'NOT_REQUIRED'" class="mt-1">Equipment is explicitly marked not required.</p>
      <ul v-else-if="props.snapshot.equipment?.length" class="mt-1 list-disc pl-5"><li v-for="(item,index) in props.snapshot.equipment" :key="index">{{ item.label }} · {{ item.quantity }}</li></ul>
      <p v-else class="mt-1 text-muted-foreground">The approved equipment list is not available.</p>
    </div>
  </section>
</template>
