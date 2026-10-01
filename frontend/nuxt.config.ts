import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/tailwind.css'],
  compatibilityDate: '2025-01-01',
  vite: {
    plugins: [tailwindcss()],
  },
  modules: ['shadcn-nuxt', 'nuxt-auth-utils'],
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: 'Ui',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui',
  },
  /**
   * Server-only settings (never sent to the browser). Override each one with
   * an env var in frontend/.env — Nuxt maps them automatically:
   *   apiBaseUrl → NUXT_API_BASE_URL
   *   authMode   → NUXT_AUTH_MODE
   */
  runtimeConfig: {
    // Where the BFF reaches the backend: Kong. In Docker this becomes http://kong:8000.
    apiBaseUrl: 'http://localhost:8000',
    // 'mock' = login against server/utils/mockUserDb.ts (no backend needed;
    //          matches the event mocks and existing tests).
    // 'live' = login through the real auth-service (needs the Docker stack).
    authMode: 'mock',
  },
})
