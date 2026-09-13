<script setup lang="ts">
import { GalleryVerticalEndIcon } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const isDark = ref(false)
const rememberMe = ref(false)

useHead({
  title: 'Sign in | ConnectSphere',
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

function handleSubmit() {
  // Authentication is intentionally outside the scope of the supplied frames.
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
                name="email"
                type="email"
                autocomplete="email"
                placeholder="m@example.com"
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
                name="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </Field>

            <Field orientation="horizontal" class="gap-2">
              <Checkbox id="remember-me" v-model="rememberMe" />
              <FieldLabel for="remember-me" class="font-normal">
                Remember me
              </FieldLabel>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-4">
        <Button type="submit" form="login-form" class="w-full">
          Sign in
        </Button>
        <p class="text-center text-sm text-muted-foreground">
          Don’t have an account? <span class="text-foreground">Contact your Event Coordinator.</span>
        </p>
      </CardFooter>
    </Card>
  </main>
</template>
