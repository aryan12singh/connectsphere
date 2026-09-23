<script setup lang="ts">
import { GalleryVerticalEndIcon } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const route = useRoute()
const isDark = ref(false)

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
          <NuxtLink
            to="/"
            :aria-current="route.path === '/' ? 'page' : undefined"
            class="font-medium text-foreground underline decoration-2 underline-offset-[6px]"
          >
            Events
          </NuxtLink>
          <span class="text-muted-foreground">Venues</span>
          <span class="text-muted-foreground">Equipment</span>
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
        <Button as-child size="sm" class="hidden md:inline-flex">
          <NuxtLink to="/requests/new">
            New event request
          </NuxtLink>
        </Button>
        <UserMenu />
      </div>
    </header>

    <slot />
  </div>
</template>
