<script setup lang="ts">
import { GalleryVerticalEndIcon } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import AppErrorAlert from '@/components/shared/AppErrorAlert.vue'
import { Switch } from '@/components/ui/switch'
import { roleHome } from '~~/lib/roles'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const route = useRoute()
const { user } = useUserSession()
const { can } = usePermissions()
const isEventRole = computed(() => ['EVENT_ORGANISER', 'EVENT_COORDINATOR'].includes(user.value?.role ?? ''))
const canRequest = computed(() => user.value?.role === 'EVENT_ORGANISER' && can('event_requests.create'))
const isDark = ref(false)
const isVenueRoute = computed(() => route.path === '/venue' || route.path.startsWith('/venue/'))

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
          <NuxtLink :to="roleHome(user?.role ?? '')" class="text-muted-foreground">Home</NuxtLink>
          <NuxtLink
            v-if="isEventRole && can('events.view')"
            to="/"
            :aria-current="route.path === '/' ? 'page' : undefined"
            :class="route.path === '/' ? 'font-medium text-foreground underline decoration-2 underline-offset-[6px]' : 'font-medium text-muted-foreground hover:text-foreground'"
          >
            Events
          </NuxtLink>
          <NuxtLink
            v-if="can('venues.view')"
            to="/venue"
            :aria-current="isVenueRoute ? 'page' : undefined"
            :class="isVenueRoute ? 'font-medium text-foreground underline decoration-2 underline-offset-[6px]' : 'font-medium text-muted-foreground hover:text-foreground'"
          >
            Venues
          </NuxtLink>

        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-3 md:gap-4">
        <div class="flex items-center gap-2">
          <label for="site-theme-toggle" class="text-sm text-muted-foreground">Dark mode</label>
          <Switch
            id="site-theme-toggle"
            v-model="isDark"
            size="sm"
            :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
          />
        </div>
        <Button v-if="canRequest" as-child size="sm" class="hidden md:inline-flex">
          <NuxtLink to="/requests/new">
            New event request
          </NuxtLink>
        </Button>
        <UserMenu />
      </div>
    </header>

    <slot />
    <AppErrorAlert />
  </div>
</template>
