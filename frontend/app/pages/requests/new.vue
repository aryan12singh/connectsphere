<script setup lang="ts">
import { GalleryVerticalEndIcon } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const isDark = ref(false)

const form = ref({
  eventName: '',
  purpose: '',
  description: '',
  proposedDate: '',
  expectedAttendance: '',
  startTime: '',
  endTime: '',
  timeZone: '',
  minimumCapacity: '',
  preferredLayout: '',
  venueType: '',
  venueRequirements: '',
  accessibilityDetails: '',
  technicalDetails: '',
})

const accessibilityNeeds = ref<Record<string, boolean>>({})
const equipmentNeeds = ref<Record<string, boolean>>({})

const ACCESSIBILITY_OPTIONS = [
  'Wheelchair accessible entrance & seating',
  'Hearing loop / assisted listening',
  'Accessible restrooms nearby',
  'No known accessibility needs',
  'Other accessibility needs',
]

const EQUIPMENT_OPTIONS = [
  'Projector & screen',
  'PA system & microphones',
  'Staging / podium',
  'Live streaming setup',
  'No equipment required',
  'Other equipment / technical need',
]

useHead({
  title: 'New event request | ConnectSphere',
})

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

onMounted(() => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  isDark.value = savedTheme
    ? savedTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches

  applyTheme(isDark.value)
})

watch(isDark, (dark) => {
  if (!import.meta.client)
    return

  applyTheme(dark)
  localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
})
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground">
    <header class="flex h-16 items-center justify-between gap-4 border-b border-border px-5 md:px-8">
      <div class="flex min-w-0 items-center gap-5">
        <div class="flex shrink-0 items-center gap-2" aria-label="ConnectSphere">
          <span class="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon class="size-3.5" aria-hidden="true" />
          </span>
          <span class="truncate text-sm font-medium">ConnectSphere</span>
        </div>

        <nav class="hidden items-center gap-5 text-sm lg:flex" aria-label="Primary">
          <span class="text-muted-foreground">Dashboard</span>
          <NuxtLink to="/" class="font-medium text-foreground underline decoration-2 underline-offset-[6px]">
            Events
          </NuxtLink>
          <span class="text-muted-foreground">Venues</span>
          <span class="text-muted-foreground">Equipment</span>
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-3 md:gap-4">
        <div class="flex items-center gap-2">
          <label for="request-theme-toggle" class="text-sm text-muted-foreground">Dark mode</label>
          <Switch
            id="request-theme-toggle"
            v-model="isDark"
            size="sm"
            :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
          />
        </div>
        <Button size="sm" class="hidden md:inline-flex">
          New event request
        </Button>
        <Avatar size="sm" aria-label="Your account">
          <AvatarFallback>EO</AvatarFallback>
        </Avatar>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[90rem] px-5 pb-32 pt-6 md:px-8 md:py-8 lg:pb-8">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
          New event request
        </h1>
        <Badge variant="secondary">
          Draft
        </Badge>
      </div>

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form id="event-request-form" @submit.prevent>
          <div class="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 class="text-xl font-semibold">
                    Event details
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="gap-5">
                  <Field class="gap-2">
                    <FieldLabel for="event-name">
                      Event name
                    </FieldLabel>
                    <Input
                      id="event-name"
                      v-model="form.eventName"
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
                      v-model="form.purpose"
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
                      v-model="form.description"
                      name="description"
                      rows="3"
                      placeholder="Describe the event, audience, and any special requirements…"
                      class="bg-input/50 min-h-16 w-full min-w-0 rounded-3xl border border-transparent px-3 py-2 text-base outline-none transition-[color,box-shadow,background-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 class="text-xl font-semibold">
                    Date, time &amp; attendance
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="gap-5">
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="proposed-date">
                        Proposed date <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Input
                        id="proposed-date"
                        v-model="form.proposedDate"
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
                        v-model="form.expectedAttendance"
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
                        v-model="form.startTime"
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
                        v-model="form.endTime"
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
                      v-model="form.timeZone"
                      name="timeZone"
                      type="text"
                      autocomplete="off"
                      required
                      aria-required="true"
                      placeholder="e.g. Asia/Singapore"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 class="text-xl font-semibold">
                    Venue requirements
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="gap-5">
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field class="gap-2">
                      <FieldLabel for="minimum-capacity">
                        Minimum capacity (required for physical events)
                      </FieldLabel>
                      <Input
                        id="minimum-capacity"
                        v-model="form.minimumCapacity"
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
                        v-model="form.preferredLayout"
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
                        v-model="form.venueType"
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
                        v-model="form.venueRequirements"
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
                        <Checkbox v-model="accessibilityNeeds[option]" />
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
                      v-model="form.accessibilityDetails"
                      name="accessibilityDetails"
                      type="text"
                      autocomplete="off"
                      placeholder="Describe mobility, sensory, communication or other support..."
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 class="text-xl font-semibold">
                    Equipment &amp; technical requirements
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="gap-5">
                  <FieldSet>
                    <FieldLegend class="sr-only">
                      Equipment needs
                    </FieldLegend>
                    <FieldGroup class="gap-2.5">
                      <label v-for="option in EQUIPMENT_OPTIONS" :key="option" class="flex items-center gap-2.5 text-sm">
                        <Checkbox v-model="equipmentNeeds[option]" />
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
                      v-model="form.technicalDetails"
                      name="technicalDetails"
                      type="text"
                      autocomplete="off"
                      placeholder="Describe quantities, connectivity, power or setup requirements…"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </form>

        <Card aria-label="Request status" class="hidden lg:block">
          <CardHeader>
            <CardTitle>
              <h2 class="text-xl font-semibold">
                Request status
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent class="grid gap-4">
            <Badge variant="secondary" class="w-fit">
              Draft
            </Badge>
            <p class="text-sm text-muted-foreground">
              Last saved automatically 2 minutes ago. You can keep editing before submitting.
            </p>
            <Button type="button" variant="outline" class="w-full">
              Save draft
            </Button>
            <Button type="submit" form="event-request-form" class="w-full">
              Submit request
            </Button>
            <p class="text-sm text-muted-foreground">
              Once submitted, an Event Coordinator will be assigned to review your request.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>

    <div
      data-testid="mobile-action-bar"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
    >
      <div class="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" class="w-full">
          Save draft
        </Button>
        <Button type="submit" form="event-request-form" class="w-full">
          Submit request
        </Button>
      </div>
    </div>
  </div>
</template>
