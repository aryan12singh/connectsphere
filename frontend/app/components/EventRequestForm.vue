<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { RequestFormState } from './request-form-state'
import { ACCESSIBILITY_OPTIONS, EQUIPMENT_OPTIONS } from './request-form-state'

withDefaults(defineProps<{ disabled?: boolean, fieldErrors?: Record<string,string[]> }>(), { disabled: false, fieldErrors: () => ({}) })
const model = defineModel<RequestFormState>({ required: true })
</script>

<template>
  <!-- One native fieldset disables every control when read-only. -->
  <fieldset :disabled="disabled" class="m-0 grid min-w-0 gap-6 border-0 p-0">
            <section aria-labelledby="event-details" class="grid gap-5">
              <h2 id="event-details" class="text-xl font-semibold">
                    Event details
              </h2>
                <FieldGroup class="gap-5">
                  <Field class="gap-2">
                    <FieldLabel for="event-name">
                      Event name <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="event-name"
                      v-model="model.eventName"
                      name="eventName"
                      aria-required="true"
                      :aria-invalid="!!fieldErrors.eventName"
                      :aria-describedby="fieldErrors.eventName ? 'error-eventName' : undefined"
                      type="text"
                      autocomplete="off"
                      placeholder="e.g. Autumn Product Summit"
                    />
                  </Field>

                  <Field class="gap-2">
                    <FieldLabel for="purpose">
                      Purpose <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="purpose"
                      v-model="model.purpose"
                      name="purpose"
                      aria-required="true"
                      :aria-invalid="!!fieldErrors.purpose"
                      :aria-describedby="fieldErrors.purpose ? 'error-purpose' : undefined"
                      type="text"
                      autocomplete="off"
                      placeholder="Product launch, conference, gala, training…"
                    />
                  </Field>

                  <Field class="gap-2">
                    <FieldLabel for="description">
                      Description
                    </FieldLabel>
                    <textarea
                      id="description"
                      v-model="model.description"
                      name="description"
                      :aria-invalid="!!fieldErrors.description"
                      :aria-describedby="fieldErrors.description ? 'error-description' : undefined"
                      rows="3"
                      placeholder="Describe the event, audience, and any special requirements…"
                      class="bg-input/50 min-h-16 w-full min-w-0 rounded-3xl border border-transparent px-3 py-2 text-base outline-none transition-[color,box-shadow,background-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
                    />
                  </Field>
                </FieldGroup>
            </section>

            <section aria-labelledby="date-time-attendance" class="grid gap-5">
              <h2 id="date-time-attendance" class="text-xl font-semibold">
                    Date, time &amp; attendance
              </h2>
                <FieldGroup class="gap-5">
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="proposed-date">
                        Proposed date <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Input
                        id="proposed-date"
                        v-model="model.proposedDate"
                        name="proposedDate"
                      :aria-invalid="!!fieldErrors.proposedDate"
                      :aria-describedby="fieldErrors.proposedDate ? 'error-proposedDate' : undefined"
                        type="date"
                        aria-required="true"
                      />
                    </Field>

                    <Field class="gap-2">
                      <FieldLabel for="expected-attendance">
                        Expected attendance <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Input
                        id="expected-attendance"
                        v-model="model.expectedAttendance"
                        name="expectedAttendance"
                      :aria-invalid="!!fieldErrors.expectedAttendance"
                      :aria-describedby="fieldErrors.expectedAttendance ? 'error-expectedAttendance' : undefined"
                        type="number"
                        min="1"
                        step="1"
                        aria-required="true"
                        placeholder="Number of attendees..."
                      />
                    </Field>
                  </div>

                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="start-time">
                        Start time <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Input
                        id="start-time"
                        v-model="model.startTime"
                        name="startTime"
                      :aria-invalid="!!fieldErrors.startTime"
                      :aria-describedby="fieldErrors.startTime ? 'error-startTime' : undefined"
                        type="time"
                        aria-required="true"
                      />
                    </Field>

                    <Field class="gap-2">
                      <FieldLabel for="end-time">
                        End time <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Input
                        id="end-time"
                        v-model="model.endTime"
                        name="endTime"
                      :aria-invalid="!!fieldErrors.endTime"
                      :aria-describedby="fieldErrors.endTime ? 'error-endTime' : undefined"
                        type="time"
                        aria-required="true"
                      />
                    </Field>
                  </div>

                  <Field class="gap-2">
                    <FieldLabel for="time-zone">
                      Time zone <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="time-zone"
                      v-model="model.timeZone"
                      name="timeZone"
                      :aria-invalid="!!fieldErrors.timeZone"
                      :aria-describedby="fieldErrors.timeZone ? 'error-timeZone' : undefined"
                      type="text"
                      autocomplete="off"
                      aria-required="true"
                      placeholder="e.g. Asia/Singapore"
                    />
                  </Field>
                </FieldGroup>
            </section>

            <Field class="gap-2"><FieldLabel for="end-date">End date (leave empty for the proposed date)</FieldLabel><Input id="end-date" v-model="model.endDate" name="endDate" type="date" :aria-invalid="!!fieldErrors.endDate" aria-describedby="error-endDate" /></Field>
            <section aria-labelledby="venue-requirements-heading" class="grid gap-5">
              <h2 id="venue-requirements-heading" class="text-xl font-semibold">
                    Venue requirements
              </h2>
                <FieldGroup class="gap-5">
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="minimum-capacity">
                        Minimum capacity (optional)
                      </FieldLabel>
                      <Input
                        id="minimum-capacity"
                        v-model="model.minimumCapacity"
                        name="minimumCapacity"
                      :aria-invalid="!!fieldErrors.minimumCapacity"
                      :aria-describedby="fieldErrors.minimumCapacity ? 'error-minimumCapacity' : undefined"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Number of minimum capacity..."
                      />
                    </Field>

                    <Field class="gap-2">
                      <FieldLabel for="preferred-layout">
                        Preferred layout (choose Other when needed)
                      </FieldLabel>
                      <select
                        id="preferred-layout"
                        v-model="model.preferredLayout"
                        name="preferredLayout"
                      :aria-invalid="!!fieldErrors.preferredLayout"
                      :aria-describedby="fieldErrors.preferredLayout ? 'error-preferredLayout' : undefined"
                        class="bg-input/50 h-9 w-full min-w-0 rounded-3xl border border-transparent px-3 text-base text-foreground outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
                      >
                        <option value="" disabled>
                          Select your preferred layout...
                        </option>
                        <option value="theatre">
                          Theatre
                        </option>
                        <option value="classroom">
                          Classroom
                        </option>
                        <option value="banquet">
                          Banquet
                        </option>
                        <option value="boardroom">
                          Boardroom
                        </option>
                        <option value="OTHER">
                          Other
                        </option>
                      </select>
                    </Field>
                  </div>

                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="venue-type">
                        Venue type <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <select
                        id="venue-type"
                        v-model="model.venueType"
                        name="venueType"
                      :aria-invalid="!!fieldErrors.venueType"
                      :aria-describedby="fieldErrors.venueType ? 'error-venueType' : undefined"
                        aria-required="true"
                        class="bg-input/50 h-9 w-full min-w-0 rounded-3xl border border-transparent px-3 text-base text-foreground outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
                      >
                        <option value="" disabled>
                          Select physical, virtual or hybrid...
                        </option>
                        <option value="physical">
                          Physical
                        </option>
                        <option value="virtual">
                          Virtual
                        </option>
                        <option value="hybrid">
                          Hybrid
                        </option>
                      </select>
                    </Field>

                    <Field class="gap-2">
                      <FieldLabel for="venue-requirements">
                        Venue / location requirements
                      </FieldLabel>
                      <Input
                        id="venue-requirements"
                        v-model="model.venueRequirements"
                        name="venueRequirements"
                      :aria-invalid="!!fieldErrors.venueRequirements"
                      :aria-describedby="fieldErrors.venueRequirements ? 'error-venueRequirements' : undefined"
                        type="text"
                        autocomplete="off"
                        placeholder="Preferred area, room, address or virtual setup..."
                      />
                    </Field>
                  </div>

                  <FieldSet>
                    <FieldLegend>Accessibility needs</FieldLegend>
                    <FieldGroup class="gap-2.5">
                      <label v-for="option in ACCESSIBILITY_OPTIONS" :key="option" class="flex items-center gap-2.5 text-sm">
                        <Checkbox v-model="model.accessibilityNeeds[option]" />
                        <span>{{ option }}</span>
                      </label>
                    </FieldGroup>
                  </FieldSet>

                  <Field class="gap-2">
                    <FieldLabel for="accessibility-details">
                      Accessibility details (optional)
                    </FieldLabel>
                    <Input
                      id="accessibility-details"
                      v-model="model.accessibilityDetails"
                      name="accessibilityDetails"
                      :aria-invalid="!!fieldErrors.accessibilityDetails"
                      :aria-describedby="fieldErrors.accessibilityDetails ? 'error-accessibilityDetails' : undefined"
                      type="text"
                      autocomplete="off"
                      placeholder="Describe mobility, sensory, communication or other support..."
                    />
                  </Field>
                </FieldGroup>
            </section>

            <section aria-labelledby="equipment-requirements" class="grid gap-5">
              <h2 id="equipment-requirements" class="text-xl font-semibold">
                    Equipment &amp; technical requirements
              </h2>
                <FieldGroup class="gap-5">
                  <FieldSet>
                    <FieldLegend class="sr-only">
                      Equipment needs
                    </FieldLegend>
                    <FieldGroup class="gap-2.5">
                      <label v-for="option in EQUIPMENT_OPTIONS" :key="option" class="flex items-center gap-2.5 text-sm">
                        <Checkbox v-model="model.equipmentNeeds[option]" />
                        <span>{{ option }}</span>
                      </label>
                    </FieldGroup>
                  </FieldSet>

                  <Field class="gap-2">
                    <FieldLabel for="technical-details">
                      Additional technical details (optional)
                    </FieldLabel>
                    <Input
                      id="technical-details"
                      v-model="model.technicalDetails"
                      name="technicalDetails"
                      :aria-invalid="!!fieldErrors.technicalDetails"
                      :aria-describedby="fieldErrors.technicalDetails ? 'error-technicalDetails' : undefined"
                      type="text"
                      autocomplete="off"
                      placeholder="Describe quantities, connectivity, power or setup requirements…"
                    />
                  </Field>
                </FieldGroup>
            </section>
    <section aria-labelledby="registration-settings" class="grid gap-4">
      <h2 id="registration-settings" class="text-xl font-semibold">Registration</h2>
      <label class="flex items-center gap-3 text-sm"><input v-model="model.registrationEnabled" name="registrationEnabled" type="checkbox"> Enable registration</label>
      <div v-if="model.registrationEnabled" class="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel for="registration-opens">Registration opens</FieldLabel><Input id="registration-opens" v-model="model.registrationOpensAt" type="datetime-local" name="registrationOpensAt" :aria-invalid="!!fieldErrors.registrationOpensAt" aria-describedby="error-registrationOpensAt" /></Field>
        <Field><FieldLabel for="registration-closes">Registration closes</FieldLabel><Input id="registration-closes" v-model="model.registrationClosesAt" type="datetime-local" name="registrationClosesAt" :aria-invalid="!!fieldErrors.registrationClosesAt" aria-describedby="error-registrationClosesAt" /></Field>
      </div>
      <p class="text-sm text-muted-foreground">Opening and closing times use the event's time zone.</p>
    </section>
    <div v-if="Object.keys(fieldErrors).length" role="alert" aria-label="Fields to correct" class="grid gap-2 text-sm text-destructive">
      <p v-for="(messages,field) in fieldErrors" :id="`error-${field}`" :key="field"><strong>{{ field }}:</strong> {{ messages.join(' ') }}</p>
    </div>
  </fieldset>
</template>
