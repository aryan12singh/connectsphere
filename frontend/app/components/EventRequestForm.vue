<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { RequestFormState } from './event-request-form'
import { ACCESSIBILITY_OPTIONS, EQUIPMENT_OPTIONS } from './event-request-form'

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
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
                      Event name
                    </FieldLabel>
                    <Input
                      id="event-name"
                      v-model="model.eventName"
                      name="eventName"
                      type="text"
                      autocomplete="off"
                      placeholder="e.g. Autumn Product Summit"
                    />
                  </Field>

                  <Field class="gap-2">
                    <FieldLabel for="purpose">
                      Purpose
                    </FieldLabel>
                    <Input
                      id="purpose"
                      v-model="model.purpose"
                      name="purpose"
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
                        type="date"
                        required
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
                        type="number"
                        min="1"
                        step="1"
                        required
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
                        type="time"
                        required
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
                        type="time"
                        required
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
                      type="text"
                      autocomplete="off"
                      required
                      aria-required="true"
                      placeholder="e.g. Asia/Singapore"
                    />
                  </Field>
                </FieldGroup>
            </section>

            <section aria-labelledby="venue-requirements" class="grid gap-5">
              <h2 id="venue-requirements" class="text-xl font-semibold">
                    Venue requirements
              </h2>
                <FieldGroup class="gap-5">
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="minimum-capacity">
                        Minimum capacity (required for physical events)
                      </FieldLabel>
                      <Input
                        id="minimum-capacity"
                        v-model="model.minimumCapacity"
                        name="minimumCapacity"
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
                        required
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
                      Accessibility details (required for Other)
                    </FieldLabel>
                    <Input
                      id="accessibility-details"
                      v-model="model.accessibilityDetails"
                      name="accessibilityDetails"
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
                      Additional technical details (required for Other)
                    </FieldLabel>
                    <Input
                      id="technical-details"
                      v-model="model.technicalDetails"
                      name="technicalDetails"
                      type="text"
                      autocomplete="off"
                      placeholder="Describe quantities, connectivity, power or setup requirements…"
                    />
                  </Field>
                </FieldGroup>
            </section>
  </fieldset>
</template>
