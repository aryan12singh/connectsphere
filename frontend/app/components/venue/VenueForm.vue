<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { applyOperatingSchedule, createVenueForm, OPERATING_WEEKDAYS, operatingSchedule, type VenueFormState } from './venue-form-state'

interface Option { value: string, label: string }
interface Communication {eventId:string,title:string,coordinatorId:string,organiserId:string,bookings:{id:string,version:number}[],staffInformedCoordinator?:boolean,coordinatorInformedOrganiser?:boolean,note?:string}
interface VenueOptions {
  maxBufferMinutes?: number
  venueTypes?: Option[]
  supportedLayouts?: Option[]
  facilities?: Option[]
  accessibilityTags?: Option[]
}

const props = withDefaults(defineProps<{
  venue?: (Partial<VenueFormState> & {buffersLockedAt?:string | null,legacyBufferConfigurationPending?:boolean}) | null
  legacyContext?: {venueId:string,version:number,affectedEvents:Communication[]} | null
  legacyError?: string | null
  buffersEditable?: boolean
  options?: VenueOptions | null
  saving?: boolean
  submitLabel?: string
  errors?: Record<string, string[]> | null
}>(), { venue: null, options: null, saving: false, submitLabel: 'Save changes', errors: null })

const emit = defineEmits<{ submit: [form: VenueFormState],configureLegacy:[payload:{version:number,setupMinutes:number,turnaroundMinutes:number,reason:string,communications:Communication[]}] }>()
const form = reactive(createVenueForm(props.venue ?? {}))
const schedule = computed(() => operatingSchedule(form.operatingHours))
const reasonPopoverOpen = ref(false)
const ready = ref(false)
const legacy=reactive({setupMinutes:0 as number|string,turnaroundMinutes:0 as number|string,reason:'',communications:[] as Communication[]})
watch(()=>[props.legacyContext,props.venue] as const,()=>{legacy.setupMinutes=props.venue?.setupMinutes??0;legacy.turnaroundMinutes=props.venue?.turnaroundMinutes??0;legacy.reason='';legacy.communications=(props.legacyContext?.affectedEvents??[]).map(e=>({...e,staffInformedCoordinator:false,coordinatorInformedOrganiser:false,note:''}))},{immediate:true})
watch(()=>[Number(legacy.setupMinutes),Number(legacy.turnaroundMinutes)],()=>{for(const c of legacy.communications){c.staffInformedCoordinator=false;c.coordinatorInformedOrganiser=false;c.note=''}})
const buffersLocked=computed(()=>Boolean(props.venue?.buffersLockedAt)&&props.buffersEditable!==true)
const legacyValid=computed(()=>ready.value && !props.saving && props.venue?.legacyBufferConfigurationPending===true && props.legacyContext?.version===props.venue?.version && legacy.reason.trim().length>0 && legacy.reason.trim().length<=1000 && [legacy.setupMinutes,legacy.turnaroundMinutes].every(v=>String(v).trim()!=='' && Number.isSafeInteger(Number(v)) && Number(v)>=0 && Number(v)<=(props.options?.maxBufferMinutes??480)) && legacy.communications.every(c=>c.staffInformedCoordinator===true && c.coordinatorInformedOrganiser===true && (c.note??'').trim().length>0 && (c.note??'').trim().length<=1000))
function configureLegacy(){if(!legacyValid.value)return;emit('configureLegacy',{version:props.legacyContext!.version,setupMinutes:Number(legacy.setupMinutes),turnaroundMinutes:Number(legacy.turnaroundMinutes),reason:legacy.reason.trim(),communications:legacy.communications.map(c=>({...c,note:c.note!.trim()}))})}
onMounted(() => { ready.value = true })

watch(() => props.venue, (venue) => Object.assign(form, createVenueForm(venue ?? {})), { deep: true })

function requestSubmit() {
  if (!ready.value || props.saving) return
  reasonPopoverOpen.value = true
}

function submit() {
  if (!ready.value || props.saving || !form.reason.trim()) return
  reasonPopoverOpen.value = false
  emit('submit', createVenueForm(form))
}

function errorFor(field: string) {
  return props.errors?.[field]?.[0]
}

function toggle(values: string[], value: string, checked: boolean | 'indeterminate') {
  const index = values.indexOf(value)
  if (checked === true && index === -1) values.push(value)
  if (checked !== true && index !== -1) values.splice(index, 1)
}

function updateOperatingDay(weekday: string, checked: boolean | 'indeterminate') {
  const weekdays = new Set(schedule.value.weekdays)
  if (checked === true) weekdays.add(weekday)
  else weekdays.delete(weekday)
  form.operatingHours = applyOperatingSchedule(form.operatingHours, [...weekdays], schedule.value.opensAt, schedule.value.closesAt)
}

function updateOperatingTime(type: 'opensAt' | 'closesAt', value: string | number) {
  const time = String(value)
  form.operatingHours = applyOperatingSchedule(form.operatingHours, schedule.value.weekdays, type === 'opensAt' ? time : schedule.value.opensAt, type === 'closesAt' ? time : schedule.value.closesAt)
}
</script>

<template>
  <form class="mx-auto grid w-full max-w-[90rem] gap-6 px-5 py-8 md:px-12 md:py-8" @submit.prevent="requestSubmit">
    <div class="grid gap-3">
      <slot name="title" />
    </div>

    <fieldset :disabled="!ready || saving" class="grid min-w-0 gap-6 border-0 p-0" aria-label="Venue details form">
    <section aria-labelledby="venue-details" class="grid gap-5">
      <h2 id="venue-details" class="text-xl font-semibold">Venue details</h2>
      <FieldGroup class="gap-5">
        <Field class="gap-2"><FieldLabel for="venue-name">Venue name <span aria-hidden="true">*</span></FieldLabel><Input id="venue-name" v-model="form.name" required /></Field>
        <Field class="gap-2"><FieldLabel for="venue-address">Venue address <span aria-hidden="true">*</span></FieldLabel><Input id="venue-address" v-model="form.address" :required="form.venueType !== 'VIRTUAL'" /><p v-if="errorFor('address')" class="text-sm text-destructive">{{ errorFor('address') }}</p></Field>
        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2"><FieldLabel for="venue-capacity">Venue capacity <span aria-hidden="true">*</span></FieldLabel><Input id="venue-capacity" v-model="form.capacity" type="number" min="1" step="1" :required="form.venueType !== 'VIRTUAL'" /><p v-if="errorFor('capacity')" class="text-sm text-destructive">{{ errorFor('capacity') }}</p></Field>
          <Field class="gap-2"><FieldLabel for="venue-type">Venue type <span aria-hidden="true">*</span></FieldLabel><select id="venue-type" v-model="form.venueType" class="bg-input/50 h-9 rounded-3xl border border-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"><option v-for="option in options?.venueTypes ?? []" :key="option.value" :value="option.value">{{ option.label }}</option></select></Field>
        </div>
      </FieldGroup>
    </section>

    <section aria-labelledby="venue-preparation" class="grid gap-5">
      <h2 id="venue-preparation" class="text-xl font-semibold">Preparation and turnaround</h2>
      <p class="text-sm text-muted-foreground">These times apply to every booking at this venue. Changes also recheck existing commitments.</p>
      <div class="grid gap-5 sm:grid-cols-2">
        <p v-if="buffersLocked" class="text-sm text-muted-foreground">Setup and turnaround are locked for this venue. Other details remain editable.</p>
        <Field class="gap-2"><FieldLabel for="venue-setup-minutes">Setup time (minutes)</FieldLabel><Input id="venue-setup-minutes" :disabled="buffersLocked" v-model="form.setupMinutes" type="number" min="0" :max="options?.maxBufferMinutes" step="1" required :aria-invalid="Boolean(errorFor('setupMinutes'))" /><p v-if="errorFor('setupMinutes')" role="alert" class="text-sm text-destructive">{{ errorFor('setupMinutes') }}</p></Field>
        <Field class="gap-2"><FieldLabel for="venue-turnaround-minutes">Turnaround time (minutes)</FieldLabel><Input id="venue-turnaround-minutes" :disabled="buffersLocked" v-model="form.turnaroundMinutes" type="number" min="0" :max="options?.maxBufferMinutes" step="1" required :aria-invalid="Boolean(errorFor('turnaroundMinutes'))" /><p v-if="errorFor('turnaroundMinutes')" role="alert" class="text-sm text-destructive">{{ errorFor('turnaroundMinutes') }}</p></Field>
      </div>
      <section v-if="props.venue?.legacyBufferConfigurationPending" class="grid gap-3 rounded-xl border p-4" aria-label="Coordinated initial buffer configuration">
        <h3 class="font-semibold">Initial buffers for existing bookings</h3>
        <p class="text-sm">This one-time configuration requires Venue Staff to inform every affected Event Coordinator, and each Coordinator to inform their Organiser. Record those conversations below. Existing approvals are retained and conflicts will be rechecked.</p>
        <p v-if="legacyError" role="alert">{{ legacyError }}</p>
        <p v-else-if="!legacyContext">Loading current affected Events…</p>
        <template v-else>
          <Field><FieldLabel for="legacy-setup-minutes">Initial setup time (minutes)</FieldLabel><Input id="legacy-setup-minutes" v-model="legacy.setupMinutes" type="number" min="0" :max="options?.maxBufferMinutes??480" step="1" /></Field>
          <Field><FieldLabel for="legacy-turnaround-minutes">Initial turnaround time (minutes)</FieldLabel><Input id="legacy-turnaround-minutes" v-model="legacy.turnaroundMinutes" type="number" min="0" :max="options?.maxBufferMinutes??480" step="1" /></Field>
          <div v-for="contact in legacy.communications" :key="contact.eventId" class="grid gap-2 rounded-lg border p-3">
            <h4 class="font-medium">{{ contact.title }}</h4>
            <label class="flex items-start gap-2"><Checkbox :id="`legacy-staff-${contact.eventId}`" v-model="contact.staffInformedCoordinator" />I informed the current Coordinator about these buffer values.</label>
            <label class="flex items-start gap-2"><Checkbox :id="`legacy-organiser-${contact.eventId}`" v-model="contact.coordinatorInformedOrganiser" />The Coordinator confirmed they informed the Organiser.</label>
            <Field><FieldLabel :for="`legacy-note-${contact.eventId}`">Communication note for {{ contact.title }}</FieldLabel><Input :id="`legacy-note-${contact.eventId}`" v-model="contact.note" maxlength="1000" placeholder="When, how and with whom the change was discussed" /></Field>
          </div>
          <p v-if="!legacy.communications.length" class="text-sm">No current or future Event commitments require communication.</p>
          <Field><FieldLabel for="legacy-buffer-reason">Initial buffer configuration reason</FieldLabel><Input id="legacy-buffer-reason" v-model="legacy.reason" maxlength="1000" /></Field>
          <Button type="button" :disabled="!legacyValid" @click="configureLegacy">Save initial buffers</Button>
        </template>
      </section>
    </section>

    <section aria-labelledby="amenity-details" class="grid gap-5">
      <h2 id="amenity-details" class="text-xl font-semibold">Amenity details</h2>
      <div class="grid gap-6 md:grid-cols-3">
        <FieldSet><FieldLegend>Supported layouts</FieldLegend><FieldGroup class="mt-3 gap-2.5"><label v-for="option in options?.supportedLayouts ?? []" :key="option.value" class="flex items-center gap-2.5 text-sm"><Checkbox :model-value="form.supportedLayouts.includes(option.value)" @update:model-value="toggle(form.supportedLayouts, option.value, $event)" /><span>{{ option.label }}</span></label></FieldGroup></FieldSet>
        <FieldSet><FieldLegend>Facilities</FieldLegend><FieldGroup class="mt-3 gap-2.5"><label v-for="option in options?.facilities ?? []" :key="option.value" class="flex items-center gap-2.5 text-sm"><Checkbox :model-value="form.facilities.includes(option.value)" @update:model-value="toggle(form.facilities, option.value, $event)" /><span>{{ option.label }}</span></label></FieldGroup></FieldSet>
        <FieldSet><FieldLegend>Accessibility</FieldLegend><FieldGroup class="mt-3 gap-2.5"><label v-for="option in options?.accessibilityTags ?? []" :key="option.value" class="flex items-center gap-2.5 text-sm"><Checkbox :model-value="form.accessibilityTags.includes(option.value)" @update:model-value="toggle(form.accessibilityTags, option.value, $event)" /><span>{{ option.label }}</span></label></FieldGroup></FieldSet>
      </div>
    </section>

    <section aria-labelledby="operating-hours" class="grid gap-5">
      <h2 id="operating-hours" class="text-xl font-semibold">Operating hours</h2>
      <Field class="w-[143px] gap-1.5"><FieldLabel>Operating days</FieldLabel><FieldGroup class="gap-1.5"><label v-for="weekday in OPERATING_WEEKDAYS" :key="weekday" class="flex items-center gap-2 whitespace-nowrap text-sm"><Checkbox :model-value="schedule.weekdays.includes(weekday)" @update:model-value="updateOperatingDay(weekday, $event)" />Every {{ weekday[0] + weekday.slice(1).toLowerCase() }}</label></FieldGroup></Field>
      <div class="grid gap-4 sm:grid-cols-2"><Field class="gap-1.5"><FieldLabel for="venue-opening-time">Opening time <span aria-hidden="true">*</span></FieldLabel><Input id="venue-opening-time" :model-value="schedule.opensAt" required placeholder="HH:MM" inputmode="numeric" @update:model-value="updateOperatingTime('opensAt', $event)" /></Field><Field class="gap-1.5"><FieldLabel for="venue-closing-time">Closing time <span aria-hidden="true">*</span></FieldLabel><Input id="venue-closing-time" :model-value="schedule.closesAt" required placeholder="HH:MM" inputmode="numeric" @update:model-value="updateOperatingTime('closesAt', $event)" /></Field></div>
      <Field class="gap-1.5"><FieldLabel for="venue-time-zone">Time zone <span aria-hidden="true">*</span></FieldLabel><Input id="venue-time-zone" v-model="form.timeZone" required placeholder="e.g. Asia/Singapore" /></Field>
    </section>

    <label class="flex items-center gap-2.5 text-sm"><Checkbox v-model="form.isActive" />Venue is active</label>
    <p v-if="errorFor('operatingHours')" role="alert" class="text-sm text-destructive">{{ errorFor('operatingHours') }}</p>
    <p v-if="errorFor('form')" role="alert" class="text-sm text-destructive">{{ errorFor('form') }}</p>
    <Popover v-model:open="reasonPopoverOpen">
      <PopoverAnchor as-child>
        <Button type="submit" :disabled="!ready || saving" class="w-full">{{ saving ? 'Saving…' : submitLabel }}</Button>
      </PopoverAnchor>
      <PopoverContent side="top" align="end" class="w-80">
        <div class="grid gap-1"><h2 class="text-sm font-semibold">Reason or note</h2><p class="text-xs text-muted-foreground">Add the reason for this venue change before saving.</p></div>
        <Field class="gap-2"><FieldLabel for="venue-reason">Reason or note <span aria-hidden="true">*</span></FieldLabel><Input :disabled="saving" id="venue-reason" v-model="form.reason" required placeholder="Describe this venue change…" @keydown.enter.prevent="submit" /><p v-if="errorFor('reason')" class="text-sm text-destructive">{{ errorFor('reason') }}</p></Field>
        <div class="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" @click="reasonPopoverOpen = false">Cancel</Button><Button type="button" size="sm" :disabled="saving || !form.reason.trim()" @click="submit">Continue</Button></div>
      </PopoverContent>
    </Popover>
    </fieldset>
  </form>
</template>
