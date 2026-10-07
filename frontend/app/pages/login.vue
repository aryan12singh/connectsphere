<script setup lang="ts">
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const { fetch: refreshSession } = useUserSession()
const isDark = ref(false)
const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const ready = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Coming from the sign-up page (/login?registered=1): confirm it worked.
const route = useRoute()
const registeredMessage = computed(() =>
  route.query.registered === '1' && !successMessage.value && !errorMessage.value
    ? 'Account created. Please sign in.'
    : '',
)

useHead({
  title: 'Sign in | ConnectSphere',
})

definePageMeta({
  layout: false,
})

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

onMounted(() => {
  ready.value = true
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

async function handleSubmit() {
  if (isSubmitting.value)
    return

  isSubmitting.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    const { data, error: signInError } = await useFetch('/api/auth', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
      },
    })
    const signedInEmail = data.value?.user?.email
    if (signInError.value || typeof signedInEmail !== 'string') {
      errorMessage.value = 'Invalid credentials'
      return
    }
    successMessage.value = `Signed in as ${signedInEmail}`
    // Sealed session lives server-side: refresh the client session state,
    // then navigate through the role-home guard. Backend identity and record
    // permissions remain the authorization boundary.
    await refreshSession()
    await navigateTo('/')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Sign in failed. Please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}
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
            <Switch
              id="theme-toggle"
              v-model="isDark"
              size="sm"
              :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
            />
          </div>
        </div>

        <CardTitle class="text-center">
          <h1>Sign in to your account</h1>
        </CardTitle>
        <CardDescription class="mx-auto max-w-[25rem] text-center">
          Event Organisers, Coordinators, Venue and Technical Support staff all sign in here.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id="login-form" @submit.prevent="handleSubmit">
          <FieldGroup class="gap-5">
            <Field class="gap-2">
              <FieldLabel for="email">Email</FieldLabel>
              <Input
                id="email"
                v-model="email"
                name="email"
                type="email"
                autocomplete="email"
                placeholder="m@example.com"
                :disabled="!ready || isSubmitting"
                required
              />
            </Field>

            <Field class="gap-2">
              <div class="flex items-center justify-between gap-4">
                <FieldLabel for="password">Password</FieldLabel>
                <a href="/forgot-password" class="shrink-0 text-sm font-medium underline-offset-4 hover:underline">
                  Forgot password?
                </a>
              </div>
              <Input
                id="password"
                v-model="password"
                name="password"
                type="password"
                autocomplete="current-password"
                :disabled="!ready || isSubmitting"
                required
              />
            </Field>

          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-4">
        <p v-if="registeredMessage" role="status" class="text-center text-sm text-foreground">
          {{ registeredMessage }}
        </p>
        <p v-if="successMessage" role="status" class="text-center text-sm text-foreground">
          {{ successMessage }}
        </p>
        <p v-if="errorMessage" role="alert" class="text-center text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button type="submit" form="login-form" class="w-full" :disabled="!ready || isSubmitting">
          {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
        </Button>
        <p class="text-center text-sm text-muted-foreground">
          New attendee?
          <NuxtLink to="/signup" class="font-medium text-foreground underline-offset-4 hover:underline">Create an account</NuxtLink>
          <br>
          Staff accounts are set up by Technical Support.
        </p>
      </CardFooter>
    </Card>
  </main>
</template>
