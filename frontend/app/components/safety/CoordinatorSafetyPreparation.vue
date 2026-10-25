<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  <Card role="region" aria-label="Safety preparation" class="gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0">
    <CardHeader class="border-b border-border px-5 py-5 md:px-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle class="text-xl font-semibold tracking-tight">Safety preparation</CardTitle>
          <p class="mt-1 text-sm text-muted-foreground">Review current readiness before a Safety check becomes available.</p>
        </div>
        <Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">Not available</Badge>
      </div>
    </CardHeader>
    <CardContent class="grid gap-5 px-5 py-5 md:px-6">
      <section aria-label="Readiness summary" class="grid gap-3 rounded-xl border border-border p-4 text-sm">
        <h3 class="font-medium">Readiness</h3>
        <p>{{ props.venueReady ? 'Venues are ready for the current requirements.' : 'Venue arrangements need attention.' }}</p>
        <ul class="grid gap-1 text-muted-foreground">
          <li v-for="(item, index) in props.outstanding" :key="index">{{ item.venueName || item.bookingId || 'Venue' }}: {{ item.reasons.map(reason).join(', ') }}</li>
          <li>Technical/support approval has not been verified.</li>
        </ul>
      </section>
      <details class="rounded-xl border border-border p-4">
        <summary class="cursor-pointer font-medium">Review the current Safety factors</summary>
        <SafetyReviewDetails class="mt-4" :snapshot="snapshot" />
      </details>
      <p class="text-sm text-muted-foreground">Safety review is not available yet. Preparation requires a current Safety Officer approval.</p>
      <Button type="button" class="w-fit" disabled>Send for Safety Check</Button>
    </CardContent>
  </Card>
</template>
