<script setup lang="ts">
/**
 * Attendee self sign-up (decided 2026-10-01).
 *
 * - Creates an ATTENDEE account that works immediately; staff accounts are
 *   created by Technical Support, never here.
 * - Shows the current password rules (tech support can change them) and
 *   ticks each one off as the user types. The server checks them again.
 * - On success, goes to /login?registered=1 to sign in (no auto-login).
 * - Live mode only: in mock mode the server answers 501 and we say so.
 */
import { GalleryVerticalEndIcon } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const THEME_STORAGE_KEY = 'connectsphere-theme'

useHead({ title: 'Create an account | ConnectSphere' })
definePageMeta({ layout: false })

// ── Form state ──
const firstName = ref('')
const lastName = ref('')
const email = ref('')
const company = ref('')
const password = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')
const triedSubmit = ref(false) // only show field errors after the first attempt

// ── Password rules (from the server; defaults until it answers) ──
interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireDigit: boolean
  requireSpecial: boolean
  notEmail: boolean
}
const { data: policyData } = await useFetch<PasswordPolicy>('/api/auth/password-policy', { key: 'password-policy' })
const policy = computed<PasswordPolicy>(() => policyData.value ?? {
  minLength: 8, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: true, notEmail: true,
})

// Each rule: what to show, and whether the typed password meets it.
const passwordRules = computed(() => {
  const p = password.value
  const rules = [{ label: `At least ${policy.value.minLength} characters`, met: p.length >= policy.value.minLength }]
  if (policy.value.requireUppercase)
    rules.push({ label: 'An uppercase letter', met: /[A-Z]/.test(p) })
  if (policy.value.requireLowercase)
    rules.push({ label: 'A lowercase letter', met: /[a-z]/.test(p) })
  if (policy.value.requireDigit)
    rules.push({ label: 'A number', met: /\d/.test(p) })
  if (policy.value.requireSpecial)
    rules.push({ label: 'A symbol, e.g. ! @ # ?', met: /[^A-Za-z0-9]/.test(p) })
  if (policy.value.notEmail)
    rules.push({ label: 'Not the same as your email', met: p.length > 0 && p.toLowerCase() !== email.value.trim().toLowerCase() })
  return rules
})
const passwordOk = computed(() => passwordRules.value.every(rule => rule.met))
const passwordsMatch = computed(() => password.value === confirmPassword.value)

// Field-level messages, shown after the first submit attempt.
const fieldErrors = computed(() => {
  if (!triedSubmit.value)
    return {} as Record<string, string>
  const errors: Record<string, string> = {}
  if (!firstName.value.trim())
    errors.firstName = 'Enter your first name.'
  if (!lastName.value.trim())
    errors.lastName = 'Enter your last name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
    errors.email = 'Enter a valid email address.'
  if (!passwordOk.value)
    errors.password = 'The password does not meet all the rules below.'
  if (!passwordsMatch.value)
    errors.confirmPassword = 'The passwords do not match.'
  return errors
})

async function handleSubmit() {
  if (isSubmitting.value)
    return
  triedSubmit.value = true
  errorMessage.value = ''
  if (Object.keys(fieldErrors.value).length > 0)
    return

  isSubmitting.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        email: email.value.trim(),
        company: company.value.trim() || undefined,
        password: password.value,
      },
    })
    await navigateTo('/login?registered=1')
  }
  catch (error) {
    const data = (error as { data?: { statusCode?: number, statusMessage?: string } }).data
    errorMessage.value = data?.statusCode === 429
      ? 'Too many sign-up attempts. Please wait a minute and try again.'
      : data?.statusMessage || 'Sign-up failed. Please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}

// ── Theme (same behaviour as the login page) ──
const isDark = ref(false)
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
onMounted(() => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  isDark.value = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
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
  <main class="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6">
    <Card class="w-full max-w-[31.5rem]">
      <CardHeader>
        <div class="mb-4 flex items-center justify-between gap-6">
          <div class="flex min-w-0 items-center gap-2" aria-label="ConnectSphere">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <GalleryVerticalEndIcon class="size-3.5" aria-hidden="true" />
            </span>
            <span class="truncate text-sm font-medium">ConnectSphere</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <label for="theme-toggle" class="text-sm font-medium">Dark</label>
            <Switch id="theme-toggle" v-model="isDark" size="sm" :aria-label="isDark ? 'Use light mode' : 'Use dark mode'" />
          </div>
        </div>

        <CardTitle class="text-center">
          <h1>Create an attendee account</h1>
        </CardTitle>
        <CardDescription class="mx-auto max-w-[25rem] text-center">
          Sign up to register for ConnectSphere events. Staff accounts are set up by Technical Support.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id="signup-form" novalidate @submit.prevent="handleSubmit">
          <FieldGroup class="gap-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <Field class="gap-2" :data-invalid="!!fieldErrors.firstName">
                <FieldLabel for="firstName">First name</FieldLabel>
                <Input
                  id="firstName" v-model="firstName" name="firstName" autocomplete="given-name" maxlength="100"
                  :disabled="isSubmitting" required :aria-invalid="!!fieldErrors.firstName"
                  :aria-describedby="fieldErrors.firstName ? 'firstName-error' : undefined"
                />
                <FieldError v-if="fieldErrors.firstName" id="firstName-error">{{ fieldErrors.firstName }}</FieldError>
              </Field>
              <Field class="gap-2" :data-invalid="!!fieldErrors.lastName">
                <FieldLabel for="lastName">Last name</FieldLabel>
                <Input
                  id="lastName" v-model="lastName" name="lastName" autocomplete="family-name" maxlength="100"
                  :disabled="isSubmitting" required :aria-invalid="!!fieldErrors.lastName"
                  :aria-describedby="fieldErrors.lastName ? 'lastName-error' : undefined"
                />
                <FieldError v-if="fieldErrors.lastName" id="lastName-error">{{ fieldErrors.lastName }}</FieldError>
              </Field>
            </div>

            <Field class="gap-2" :data-invalid="!!fieldErrors.email">
              <FieldLabel for="email">Email</FieldLabel>
              <Input
                id="email" v-model="email" name="email" type="email" autocomplete="email" maxlength="254"
                placeholder="m@example.com" :disabled="isSubmitting" required :aria-invalid="!!fieldErrors.email"
                :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
              />
              <FieldError v-if="fieldErrors.email" id="email-error">{{ fieldErrors.email }}</FieldError>
            </Field>

            <Field class="gap-2">
              <FieldLabel for="company">Organisation <span class="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="company" v-model="company" name="company" autocomplete="organization" maxlength="200" :disabled="isSubmitting" />
            </Field>

            <Field class="gap-2" :data-invalid="!!fieldErrors.password">
              <FieldLabel for="password">Password</FieldLabel>
              <Input
                id="password" v-model="password" name="password" type="password" autocomplete="new-password" maxlength="128"
                :disabled="isSubmitting" required :aria-invalid="!!fieldErrors.password"
                aria-describedby="password-rules"
              />
              <FieldError v-if="fieldErrors.password">{{ fieldErrors.password }}</FieldError>
              <FieldDescription id="password-rules">
                Your password needs:
              </FieldDescription>
              <ul class="-mt-1 grid gap-1 text-sm" aria-live="polite">
                <li
                  v-for="rule in passwordRules" :key="rule.label"
                  :class="rule.met ? 'text-success' : 'text-muted-foreground'"
                  data-testid="password-rule"
                >
                  <span aria-hidden="true">{{ rule.met ? '✓' : '○' }}</span>
                  {{ rule.label }}<span class="sr-only">{{ rule.met ? ' (met)' : ' (not met yet)' }}</span>
                </li>
              </ul>
            </Field>

            <Field class="gap-2" :data-invalid="!!fieldErrors.confirmPassword">
              <FieldLabel for="confirmPassword">Confirm password</FieldLabel>
              <Input
                id="confirmPassword" v-model="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password"
                maxlength="128" :disabled="isSubmitting" required :aria-invalid="!!fieldErrors.confirmPassword"
                :aria-describedby="fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined"
              />
              <FieldError v-if="fieldErrors.confirmPassword" id="confirmPassword-error">{{ fieldErrors.confirmPassword }}</FieldError>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-4">
        <p v-if="errorMessage" role="alert" class="text-center text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button type="submit" form="signup-form" class="w-full" :disabled="isSubmitting">
          {{ isSubmitting ? 'Creating account…' : 'Create account' }}
        </Button>
        <p class="text-center text-sm text-muted-foreground">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-foreground underline-offset-4 hover:underline">Sign in</NuxtLink>
        </p>
      </CardFooter>
    </Card>
  </main>
</template>
