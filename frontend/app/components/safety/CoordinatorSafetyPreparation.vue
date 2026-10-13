<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import SafetyReviewDetails from './SafetyReviewDetails.vue'
import type { SafetySnapshot } from './safety-review-state'
interface PreparationRoom {id:string;venueName?:string;venueId:string;status:string;venueType?:string | null;venueCapacity?:number | null;expectedAttendance:number;layout:string;accessibilityNeeds?:string[]}
const props=defineProps<{eventId:string;eventTitle:string;rooms:PreparationRoom[];venueReady:boolean;outstanding:Array<{bookingId:string | null;venueName?:string;reasons:string[]}>}>()
const reason=(value:string)=>value==='NO_VENUE_BOOKING'?'No venue booking':value.replaceAll('_',' ').toLowerCase()
// Only facts supplied by the existing authorized venue summary are populated.
// Missing operational/technical data remains unknown rather than approved.
const snapshot=computed<SafetySnapshot>(()=>({
  eventId:props.eventId,eventTitle:props.eventTitle,equipmentStatus:'UNVERIFIED',equipment:null,
  venues:props.rooms.filter(room=>room.status!=='CANCELLED').map(room=>({
    bookingId:room.id,venueName:room.venueName || room.venueId,venueType:room.venueType ?? undefined,
    expectedAttendance:room.expectedAttendance,capacity:room.venueCapacity ?? null,layout:room.layout,
    emergencyAccess:null,accessibilityNeeds:room.accessibilityNeeds ?? null,equipmentPlacement:null,crowdMovement:null,restrictions:null,
  })),
}))
</script>
<template>
  <section aria-label="Safety preparation" class="grid gap-3 rounded-2xl border border-border p-5">
    <h2 class="text-xl font-semibold">Safety preparation</h2>
    <p class="text-sm">{{ props.venueReady ? 'Venues ready for the current requirements.' : 'Venue arrangements need attention.' }}</p>
    <ul class="list-disc pl-5 text-sm text-muted-foreground"><li v-for="(item,index) in props.outstanding" :key="index">{{ item.venueName || item.bookingId || 'Venue' }}: {{ item.reasons.map(reason).join(', ') }}</li><li>Technical/support approval has not been verified.</li></ul>
    <details class="rounded-xl bg-muted p-3"><summary class="cursor-pointer text-sm font-medium">Review the current Safety factors</summary><SafetyReviewDetails class="mt-4" :snapshot="snapshot" /></details>
    <p class="text-sm text-muted-foreground">Safety review is not available yet. Preparation requires a current Safety Officer approval.</p>
    <Button type="button" disabled>Send for Safety Check</Button>
  </section>
</template>
