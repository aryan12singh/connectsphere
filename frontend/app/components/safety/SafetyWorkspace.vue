<script setup lang="ts">
import {computed,onMounted,ref,watch} from 'vue'
import {Alert} from '@/components/ui/alert'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card'
import {Textarea} from '@/components/ui/textarea'
import EventRequestForm from '../events/EventRequestForm.vue'
import {emptyRequestForm,recordToForm,formToPayload} from '../events/request-form-state'
import SafetyReviewDetails from './SafetyReviewDetails.vue'
import SafetyReworkPanel from './SafetyReworkPanel.vue'
import type {SafetyRound,SafetySnapshot,SafetyFeedback} from './safety-review-state'
interface Decision {outcome:'APPROVE'|'REJECT'|'REQUEST_CHANGES';reason:string;areas:string[];privateNotes?:string;rejectedBookingIds:string[]}
interface SafetyView {planningDetails?:Record<string,unknown>;canCorrect?:boolean;eventRequestId?:string;event:{id:string;title:string;status:string;version:number};state:string;canSubmit:boolean;venueReady?:boolean;requirementsRevision?:string;snapshot?:SafetySnapshot;technical?:{status:string;reason?:string};outstanding:Array<{reasons:string[];bookingId?:string;venueName?:string}>;nextAction?:string;round:(SafetyRound&{status:string;decision:Decision|null})|null;rework?:{reviewedRevision:string;roundId:string;note:string};activeOperation?:{key:string;version:number}|null}
const props=defineProps<{eventId:string}>(),emit=defineEmits<{changed:[status:string]}>()
const {user}=useUserSession()
const coordinator=computed(()=>user.value?.roles?.includes('EVENT_COORDINATOR')||user.value?.role==='EVENT_COORDINATOR')
const {data,error,refresh}=await useFetch<SafetyView>(()=>`/api/safety/events/${encodeURIComponent(props.eventId)}`,{watch:[()=>props.eventId]})
const correction=ref(emptyRequestForm())
watch(()=>data.value?.planningDetails,value=>{if(value)correction.value=recordToForm(value)},{immediate:true})
const pending=ref(false),message=ref(''),note=ref(''),bookingIds=ref<string[]>([]),hydrated=ref(false)
onMounted(()=>{hydrated.value=true})
const keys=new Map<string,{body:string;key:string}>()
async function command(action:string,body:Record<string,unknown>,key?:string){
 if(pending.value)return
 pending.value=true;message.value=''
 const encoded=JSON.stringify(body),saved=keys.get(action)
 const actionKey=key||(saved?.body===encoded?saved.key:crypto.randomUUID());keys.set(action,{body:encoded,key:actionKey})
 try{await $fetch(`/api/safety/events/${encodeURIComponent(props.eventId)}/${action}`,{method:'POST',body,headers:{'idempotency-key':actionKey}});keys.delete(action);await refresh();if(data.value?.event.status)emit('changed',data.value.event.status)}
 catch(caught:any){message.value=caught?.data?.data?.error?.message||caught?.data?.error?.message||caught?.statusMessage||'Unable to save. Refresh and retry.';await refresh()}
 finally{pending.value=false}
}
function submit(){const operation=data.value?.activeOperation;return command('submit',{version:operation?.version??data.value?.event.version},operation?.key)}
function recordReview(){if(!data.value?.round)return;return command('rework-review',{version:data.value.event.version,roundId:data.value.round.id,requirementsRevision:data.value.round.requirementsRevision,note:note.value,bookingIds:bookingIds.value})}
const feedback=computed<SafetyFeedback|null>(()=>{
 const round=data.value?.round,decision=round?.decision
 return round&&decision&&['REJECT','REQUEST_CHANGES'].includes(decision.outcome)?{roundId:round.id,round:round.number,decision:decision.outcome as SafetyFeedback['decision'],reason:decision.reason,affectedAreas:decision.areas}:null
})
const arrangements=computed(()=>[
 {area:'VENUE',label:'Required venues',ready:data.value?.venueReady??null},
 {area:'TECHNICAL',label:'Technical/support arrangements',ready:data.value?.technical?['APPROVED','NOT_REQUIRED'].includes(data.value.technical.status):null},
 {area:'EVENT_DETAILS',label:'Current Event requirements',ready:!data.value?.outstanding.some(x=>x.reasons.includes('EVENT_DETAILS_CHANGED'))},
])
const reason=(value:string)=>value==='TECHNICAL_NOT_APPROVED'?'Technical/support approval has not been verified.':value.replaceAll('_',' ').toLowerCase()
</script>
<template>
  <Card role="region" aria-label="Safety preparation" class="gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0">
    <CardHeader class="border-b border-border px-5 py-5 md:px-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle class="text-xl font-semibold tracking-tight">
            {{ coordinator ? 'Safety preparation' : 'Operational Safety' }}
          </CardTitle>
          <p class="mt-1 text-sm text-muted-foreground">
            Check what is ready, review outstanding work, and take the next permitted action.
          </p>
        </div>
        <Badge v-if="data" variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">
          {{ data.state.replaceAll('_', ' ').toLowerCase() }}<span v-if="data.round"> · Round {{ data.round.number }}</span>
        </Badge>
      </div>
    </CardHeader>

    <CardContent class="grid gap-5 px-5 py-5 md:px-6">
      <Alert v-if="error" variant="destructive">
        <p class="col-start-2">Safety verification is unavailable. Refresh before continuing.</p>
      </Alert>

      <template v-if="data">
        <section aria-label="Readiness summary" class="grid gap-3 rounded-xl border border-border p-4 text-sm">
          <h3 class="font-medium">Readiness</h3>
          <template v-if="coordinator">
            <p>{{ data.venueReady ? 'Venues are ready for the current requirements.' : 'Venue arrangements still need attention.' }}</p>
            <ul v-if="data.outstanding.length" class="grid gap-1 text-muted-foreground">
              <li v-for="(item, index) in data.outstanding" :key="index">
                {{ item.venueName || item.bookingId ? `${item.venueName || item.bookingId}: ` : '' }}{{ item.reasons.map(reason).join(', ') }}
              </li>
            </ul>
            <Button v-if="data.technical && !['APPROVED', 'NOT_REQUIRED'].includes(data.technical.status)" as-child variant="outline" size="sm" class="w-fit">
              <NuxtLink :to="`/technical-requirements/${data.eventRequestId ?? ''}`">
                Review technical requirements
              </NuxtLink>
            </Button>
          </template>
          <p v-if="data.nextAction" class="whitespace-pre-wrap border-t border-border pt-3 text-muted-foreground">
            {{ data.nextAction }}
          </p>
        </section>

        <details v-if="data.snapshot" class="rounded-xl border border-border p-4">
          <summary class="cursor-pointer font-medium">Review the current Safety factors</summary>
          <SafetyReviewDetails class="mt-4" :snapshot="data.snapshot" />
        </details>

        <template v-if="coordinator">
          <div class="flex flex-wrap gap-2">
            <Button v-if="!feedback && data.state !== 'APPROVED' && data.event.status !== 'PREPARATION'" data-safety-submit type="button" :disabled="!hydrated || pending || (!data.canSubmit && !data.activeOperation)" @click="submit">
              {{ data.activeOperation ? 'Resume Safety submission' : 'Send for Safety Check' }}
            </Button>
            <Button v-if="data.state === 'APPROVED' && data.event.status === 'ARRANGEMENT_PENDING'" :disabled="!hydrated || pending" @click="command('confirm', { version: data.event.version })">
              Confirm Event
            </Button>
            <Button v-if="data.state === 'APPROVED' && data.event.status === 'CONFIRMED'" :disabled="!hydrated || pending" @click="command('preparation', { version: data.event.version })">
              Start Preparation
            </Button>
          </div>

          <form v-if="data.round && ['PENDING', 'CHANGES_REQUIRED', 'STALE'].includes(data.state)" class="grid gap-4 rounded-xl border border-border p-4" @submit.prevent="recordReview">
            <div>
              <h3 class="font-medium">Coordinator review and next action</h3>
              <p class="mt-1 text-sm text-muted-foreground">Record the agreed follow-up before resubmission or arrangement changes. Existing venue and technical approvals stay in place.</p>
            </div>
            <label class="grid gap-1 text-sm">Next action<Textarea v-model="note" maxlength="2000" required /></label>
            <fieldset v-if="data.snapshot?.venues.length" class="grid gap-2 text-sm">
              <legend class="mb-1 font-medium">Bookings directed for replacement (optional)</legend>
              <label v-for="room in data.snapshot.venues" :key="room.bookingId" class="flex items-center gap-2">
                <input v-model="bookingIds" type="checkbox" :value="room.bookingId" class="size-4 accent-primary" />
                {{ room.venueName }}
              </label>
            </fieldset>
            <Button type="submit" class="w-fit" :disabled="!hydrated || pending || !note.trim()">
              {{ data.state === 'PENDING' ? 'Reopen planning with this action' : 'Record Coordinator review' }}
            </Button>
          </form>

          <details v-if="data.canCorrect && data.planningDetails" class="rounded-xl border border-border p-4">
            <summary class="cursor-pointer font-medium">Accept a reviewed Event-detail correction</summary>
            <p class="my-3 text-sm text-muted-foreground">Record agreed changes after Coordinator review. Current requirements and Safety readiness are rechecked; existing bookings and technical approvals remain in the history.</p>
            <form class="grid gap-4" @submit.prevent="command('planning-correction', { version: data.event.version, requestVersion: data.planningDetails.version, changes: formToPayload(correction) })">
              <EventRequestForm v-model="correction" :disabled="!hydrated || pending" />
              <Button class="w-fit" :disabled="!hydrated || pending" type="submit">Accept Event correction</Button>
            </form>
          </details>

          <SafetyReworkPanel v-if="feedback" :feedback="feedback" :arrangements="arrangements" :current-requirements-revision="data.requirementsRevision || ''" :readiness-requirements-revision="data.requirementsRevision || ''" :coordinator-review-revision="data.rework?.reviewedRevision" :coordinator-review-round-id="data.rework?.roundId" :can-view-feedback="true" :can-resubmit="data.canSubmit" :pending="pending" :request-error="message" @resubmit="submit" />
          <p v-if="data.event.status === 'PREPARATION'" class="text-sm text-muted-foreground">Preparation has started with current Safety approval.</p>
        </template>

        <SafetyReworkPanel v-else-if="feedback" audience="ORGANISER" :feedback="feedback" :arrangements="[]" current-requirements-revision="" readiness-requirements-revision="" :can-view-feedback="true" />
      </template>

      <Alert v-if="message" variant="destructive">
        <p class="col-start-2">{{ message }}</p>
      </Alert>
    </CardContent>
  </Card>
</template>
