<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RequestFormState } from './request-form-state'
import { ACCESSIBILITY_OPTIONS, EQUIPMENT_OPTIONS } from './request-form-state'

withDefaults(defineProps<{ disabled?: boolean, fieldErrors?: Record<string, string[]> }>(), {
  disabled: false,
  fieldErrors: () => ({}),
})

const model = defineModel<RequestFormState>({ required: true })
</script>

<template>
  <fieldset :disabled="disabled" class="m-0 grid min-w-0 gap-6 border-0 p-0">
    <section aria-labelledby="event-details" class="grid gap-5">
      <div>
        <h2 id="event-details" class="text-lg font-semibold tracking-tight">
          Event details
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Describe the Event and why it is being held.
        </p>
      </div>

      <FieldGroup class="gap-5">
        <Field class="gap-2">
          <FieldLabel for="event-name">Event name <span aria-hidden="true">*</span></FieldLabel>
          <Input id="event-name" v-model="model.eventName" name="eventName" type="text" autocomplete="off" placeholder="e.g. Autumn Product Summit" aria-required="true" :aria-invalid="!!fieldErrors.eventName" :aria-describedby="fieldErrors.eventName ? 'error-eventName' : undefined" />
        </Field>

        <Field class="gap-2">
          <FieldLabel for="purpose">Purpose <span aria-hidden="true">*</span></FieldLabel>
          <Input id="purpose" v-model="model.purpose" name="purpose" type="text" autocomplete="off" placeholder="Product launch, conference, gala, training…" aria-required="true" :aria-invalid="!!fieldErrors.purpose" :aria-describedby="fieldErrors.purpose ? 'error-purpose' : undefined" />
        </Field>

        <Field class="gap-2">
          <FieldLabel for="description">Description</FieldLabel>
          <Textarea id="description" v-model="model.description" name="description" rows="4" placeholder="Describe the Event, audience, and any special requirements…" :aria-invalid="!!fieldErrors.description" :aria-describedby="fieldErrors.description ? 'error-description' : undefined" />
        </Field>
      </FieldGroup>
    </section>

    <section aria-labelledby="date-time-attendance" class="grid gap-5 border-t border-border pt-6">
      <div>
        <h2 id="date-time-attendance" class="text-lg font-semibold tracking-tight">
          Date, time &amp; attendance
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Set the proposed schedule and the planning attendance figure.
        </p>
      </div>

      <FieldGroup class="gap-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2">
            <FieldLabel for="proposed-date">Proposed date <span aria-hidden="true">*</span></FieldLabel>
            <Input id="proposed-date" v-model="model.proposedDate" name="proposedDate" type="date" aria-required="true" :aria-invalid="!!fieldErrors.proposedDate" :aria-describedby="fieldErrors.proposedDate ? 'error-proposedDate' : undefined" />
          </Field>
          <Field class="gap-2">
            <FieldLabel for="end-date">End date</FieldLabel>
            <Input id="end-date" v-model="model.endDate" name="endDate" type="date" :aria-invalid="!!fieldErrors.endDate" :aria-describedby="fieldErrors.endDate ? 'error-endDate' : undefined" />
            <FieldDescription>Leave empty when the Event ends on the proposed date.</FieldDescription>
          </Field>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2">
            <FieldLabel for="start-time">Start time <span aria-hidden="true">*</span></FieldLabel>
            <Input id="start-time" v-model="model.startTime" name="startTime" type="time" aria-required="true" :aria-invalid="!!fieldErrors.startTime" :aria-describedby="fieldErrors.startTime ? 'error-startTime' : undefined" />
          </Field>
          <Field class="gap-2">
            <FieldLabel for="end-time">End time <span aria-hidden="true">*</span></FieldLabel>
            <Input id="end-time" v-model="model.endTime" name="endTime" type="time" aria-required="true" :aria-invalid="!!fieldErrors.endTime" :aria-describedby="fieldErrors.endTime ? 'error-endTime' : undefined" />
          </Field>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2">
            <FieldLabel for="time-zone">Time zone <span aria-hidden="true">*</span></FieldLabel>
            <Input id="time-zone" v-model="model.timeZone" name="timeZone" type="text" autocomplete="off" placeholder="e.g. Asia/Singapore" aria-required="true" :aria-invalid="!!fieldErrors.timeZone" :aria-describedby="fieldErrors.timeZone ? 'error-timeZone' : undefined" />
          </Field>
          <Field class="gap-2">
            <FieldLabel for="expected-attendance">Expected attendance <span aria-hidden="true">*</span></FieldLabel>
            <Input id="expected-attendance" v-model="model.expectedAttendance" name="expectedAttendance" type="number" min="1" step="1" placeholder="Number of attendees" aria-required="true" :aria-invalid="!!fieldErrors.expectedAttendance" :aria-describedby="fieldErrors.expectedAttendance ? 'error-expectedAttendance' : undefined" />
          </Field>
        </div>
      </FieldGroup>
    </section>

    <section aria-labelledby="venue-requirements-heading" class="grid gap-5 border-t border-border pt-6">
      <div>
        <h2 id="venue-requirements-heading" class="text-lg font-semibold tracking-tight">
          Venue requirements
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Share the space, layout, and accessibility needs for the Event.
        </p>
      </div>

      <FieldGroup class="gap-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2">
            <FieldLabel for="minimum-capacity">Minimum capacity</FieldLabel>
            <Input id="minimum-capacity" v-model="model.minimumCapacity" name="minimumCapacity" type="number" min="1" step="1" placeholder="Number of attendees" :aria-invalid="!!fieldErrors.minimumCapacity" :aria-describedby="fieldErrors.minimumCapacity ? 'error-minimumCapacity' : undefined" />
            <FieldDescription>Optional.</FieldDescription>
          </Field>
          <Field class="gap-2">
            <FieldLabel for="preferred-layout">Preferred layout</FieldLabel>
            <Select v-model="model.preferredLayout">
              <SelectTrigger id="preferred-layout" :aria-invalid="!!fieldErrors.preferredLayout" :aria-describedby="fieldErrors.preferredLayout ? 'error-preferredLayout' : undefined">
                <SelectValue placeholder="Select a preferred layout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="theatre">Theatre</SelectItem>
                <SelectItem value="classroom">Classroom</SelectItem>
                <SelectItem value="banquet">Banquet</SelectItem>
                <SelectItem value="boardroom">Boardroom</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Choose Other when the requested layout is not listed.</FieldDescription>
          </Field>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <Field class="gap-2">
            <FieldLabel for="venue-type">Venue type <span aria-hidden="true">*</span></FieldLabel>
            <Select v-model="model.venueType">
              <SelectTrigger id="venue-type" aria-required="true" :aria-invalid="!!fieldErrors.venueType" :aria-describedby="fieldErrors.venueType ? 'error-venueType' : undefined">
                <SelectValue placeholder="Select physical, virtual, or hybrid" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field class="gap-2">
            <FieldLabel for="venue-requirements">Venue or location requirements</FieldLabel>
            <Input id="venue-requirements" v-model="model.venueRequirements" name="venueRequirements" type="text" autocomplete="off" placeholder="Preferred area, room, address, or virtual setup" :aria-invalid="!!fieldErrors.venueRequirements" :aria-describedby="fieldErrors.venueRequirements ? 'error-venueRequirements' : undefined" />
          </Field>
        </div>

        <FieldSet class="gap-3">
          <FieldLegend>Accessibility needs</FieldLegend>
          <FieldGroup class="grid gap-3 sm:grid-cols-2">
            <label v-for="option in ACCESSIBILITY_OPTIONS" :key="option" class="flex items-center gap-2.5 text-sm">
              <Checkbox v-model="model.accessibilityNeeds[option]" />
              <span>{{ option }}</span>
            </label>
          </FieldGroup>
        </FieldSet>

        <Field class="gap-2">
          <FieldLabel for="accessibility-details">Accessibility details</FieldLabel>
          <Input id="accessibility-details" v-model="model.accessibilityDetails" name="accessibilityDetails" type="text" autocomplete="off" placeholder="Describe mobility, sensory, communication, or other support" :aria-invalid="!!fieldErrors.accessibilityDetails" :aria-describedby="fieldErrors.accessibilityDetails ? 'error-accessibilityDetails' : undefined" />
          <FieldDescription>Optional.</FieldDescription>
        </Field>
      </FieldGroup>
    </section>

    <section aria-labelledby="equipment-requirements" class="grid gap-5 border-t border-border pt-6">
      <div>
        <h2 id="equipment-requirements" class="text-lg font-semibold tracking-tight">
          Equipment &amp; technical requirements
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          List the equipment and support needed to prepare the Event.
        </p>
      </div>

      <FieldGroup class="gap-5">
        <FieldSet class="gap-3">
          <FieldLegend>Equipment needs</FieldLegend>
          <FieldGroup class="grid gap-3 sm:grid-cols-2">
            <label v-for="option in EQUIPMENT_OPTIONS" :key="option" class="flex items-center gap-2.5 text-sm">
              <Checkbox v-model="model.equipmentNeeds[option]" />
              <span>{{ option }}</span>
            </label>
          </FieldGroup>
        </FieldSet>

        <Field class="gap-2">
          <FieldLabel for="technical-details">Additional technical details</FieldLabel>
          <Textarea id="technical-details" v-model="model.technicalDetails" name="technicalDetails" rows="3" placeholder="Describe quantities, connectivity, power, or setup requirements" :aria-invalid="!!fieldErrors.technicalDetails" :aria-describedby="fieldErrors.technicalDetails ? 'error-technicalDetails' : undefined" />
          <FieldDescription>Optional.</FieldDescription>
        </Field>
      </FieldGroup>
    </section>

    <section aria-labelledby="registration-settings" class="grid gap-5 border-t border-border pt-6">
      <div>
        <h2 id="registration-settings" class="text-lg font-semibold tracking-tight">
          Registration
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Set whether Attendees can register and when registration opens.
        </p>
      </div>

      <!-- Kept as a native checkbox because form-level browser and E2E semantics rely on it. -->
      <label class="flex items-center gap-3 text-sm font-medium">
        <input v-model="model.registrationEnabled" name="registrationEnabled" type="checkbox" class="size-4 rounded border-input accent-primary" />
        Enable registration
      </label>

      <div v-if="model.registrationEnabled" class="grid gap-5 sm:grid-cols-2">
        <Field class="gap-2"><FieldLabel for="registration-opens">Registration opens</FieldLabel><Input id="registration-opens" v-model="model.registrationOpensAt" type="datetime-local" name="registrationOpensAt" :aria-invalid="!!fieldErrors.registrationOpensAt" :aria-describedby="fieldErrors.registrationOpensAt ? 'error-registrationOpensAt' : undefined" /></Field>
        <Field class="gap-2"><FieldLabel for="registration-closes">Registration closes</FieldLabel><Input id="registration-closes" v-model="model.registrationClosesAt" type="datetime-local" name="registrationClosesAt" :aria-invalid="!!fieldErrors.registrationClosesAt" :aria-describedby="fieldErrors.registrationClosesAt ? 'error-registrationClosesAt' : undefined" /></Field>
      </div>
      <FieldDescription>Opening and closing times use the Event time zone.</FieldDescription>
    </section>

    <div v-if="Object.keys(fieldErrors).length" role="alert" aria-label="Fields to correct" class="grid gap-2 rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
      <p v-for="(messages, field) in fieldErrors" :id="`error-${field}`" :key="field"><strong>{{ field }}:</strong> {{ messages.join(' ') }}</p>
    </div>
  </fieldset>
</template>
